from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Literal, Optional

from firebase_admin import db

import logging

StreamType = Literal['photo', 'video']
ActionType = Literal['assign', 'reassign', 'submit', 'review', 'approve', 'changes', 'note']

logger = logging.getLogger(__name__)


class PostProdSyncService:
    """Write-through helper for Firebase Realtime Database post production state."""

    def __init__(self, org_id: str, event_id: str) -> None:
        self.org_id = org_id
        self.event_id = event_id
        self.base_path = f"organizations/{org_id}/postprod-live/{event_id}"
        self.base_ref = db.reference(self.base_path)

    def update_stream_state(
        self,
        *,
        stream: StreamType,
        state: str,
        user_uid: str,
        user_name: str,
        action_type: ActionType,
        metadata: Optional[Dict[str, Any]] = None,
        version_override: Optional[int] = None,
    ) -> None:
        """Persist minimal state for stream to RTDB and record activity."""

        metadata = metadata or {}
        now = datetime.utcnow().isoformat()

        stream_ref = self.base_ref.child(f"streams/{stream}")
        current = stream_ref.get() or {}

        new_version = int(current.get('version') or 0) + 1
        if version_override is not None:
            try:
                new_version = max(new_version, int(version_override))
            except (TypeError, ValueError):
                pass
        active_users = set(current.get('activeUsers') or [])
        active_users.add(user_uid)

        payload = {
            'state': state,
            'lastUpdate': now,
            'version': new_version,
            'activeUsers': list(active_users)[:10],
            'lastAction': {
                'type': action_type,
                'by': user_uid,
                'name': user_name,
                'at': now,
            },
        }

        if metadata:
            payload['metadata'] = metadata

        stream_ref.update(payload)

        logger.info(
            "[postprod-sync] updated %s stream to %s (version %s)",
            stream,
            state,
            new_version,
        )

        self._append_activity(
            stream=stream,
            action=action_type,
            user_uid=user_uid,
            user_name=user_name,
            version=new_version,
            metadata=metadata,
        )

    def set_user_presence(
        self,
        *,
        user_uid: str,
        stream: Optional[StreamType],
        is_active: bool,
    ) -> None:
        """Track lightweight presence information for live viewers."""

        presence_ref = self.base_ref.child(f"presence/{user_uid}")

        if is_active:
            payload = {
                'stream': stream,
                'lastSeen': datetime.utcnow().isoformat(),
            }
            presence_ref.update(payload)

            if stream:
                stream_ref = self.base_ref.child(f"streams/{stream}")
                current = stream_ref.get() or {}
                active_users = set(current.get('activeUsers') or [])
                active_users.add(user_uid)
                stream_ref.update({'activeUsers': list(active_users)[:10]})
        else:
            presence_ref.delete()
            if stream:
                stream_ref = self.base_ref.child(f"streams/{stream}")
                current = stream_ref.get() or {}
                active_users = set(current.get('activeUsers') or [])
                if user_uid in active_users:
                    active_users.remove(user_uid)
                    stream_ref.update({'activeUsers': list(active_users)})

    def _append_activity(
        self,
        *,
        stream: Optional[StreamType],
        action: ActionType,
        user_uid: str,
        user_name: str,
        version: int,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Append compact activity entry with automatic retention."""

        activities_ref = self.base_ref.child('recent-activity')

        summary = self._build_summary(action=action, stream=stream, metadata=metadata)

        entry = {
            'type': action.upper(),
            'stream': stream,
            'user': user_uid,
            'userName': user_name,
            'timestamp': datetime.utcnow().isoformat(),
            'summary': summary,
            'version': version,
        }

        if metadata:
            entry['metadata'] = metadata

        activities_ref.push(entry)

        # enforce retention limit of 100 entries
        snapshot = activities_ref.order_by_child('timestamp').limit_to_last(101).get()
        if snapshot and len(snapshot) > 100:
            oldest_key = list(snapshot.keys())[0]
            activities_ref.child(oldest_key).delete()

    @staticmethod
    def _build_summary(
        *,
        action: ActionType,
        stream: Optional[StreamType],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        stream_label = (stream or 'job').upper()

        base = {
            'assign': f'Assigned editors to {stream_label}',
            'reassign': f'Reassigned editors for {stream_label}',
            'submit': f'Submitted {stream_label} deliverables',
            'review': f'Reviewed {stream_label} submission',
            'approve': f'Approved {stream_label} deliverables',
            'changes': f'Requested changes for {stream_label}',
            'note': f'Added note to {stream_label}',
        }.get(action, f'Updated {stream_label}')

        if metadata:
            if 'changeCount' in metadata:
                base += f" ({metadata['changeCount']} changes)"
            elif 'deliverableCount' in metadata:
                base += f" ({metadata['deliverableCount']} files)"

        return base
