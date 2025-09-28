from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def iso_timestamp(value: Any) -> Optional[str]:
    """Return a best-effort ISO8601 string for the given value."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    iso_method = getattr(value, "isoformat", None)
    if callable(iso_method):
        try:
            return iso_method()  # type: ignore[misc]
        except Exception:
            return str(value)
    return str(value)


def _first_int(*values: Any) -> Optional[int]:
    for value in values:
        if value is None:
            continue
        if isinstance(value, int):
            return value
        try:
            return int(value)
        except (TypeError, ValueError):
            continue
    return None


def build_submission_summary(db, org_id: str, event_id: str, job: Dict[str, Any]) -> Dict[str, Any]:
    """Assemble the intake submission summary for an event."""
    assigned_crew: List[Dict[str, Any]] = []
    data_intake: Dict[str, Any] = {}
    last_update: Any = None

    try:
        event_doc = db.collection("organizations", org_id, "events").document(event_id).get()
    except Exception:
        event_doc = None

    if event_doc and getattr(event_doc, "exists", False):
        event_payload = event_doc.to_dict() or {}
        assigned_crew = event_payload.get("assignedCrew") or []
        data_intake = event_payload.get("dataIntake") or {}
        last_update = data_intake.get("lastSubmittedAt") or data_intake.get("lastUpdatedAt")

    job_payload = job or {}
    if not assigned_crew:
        assigned_crew = (job_payload.get("aiSummary") or {}).get("assignedCrew") or []

    submissions: Dict[str, Dict[str, Any]] = {}
    intake_submissions = (data_intake or {}).get("submissions")
    if isinstance(intake_submissions, dict):
        submissions = {uid: (entry or {}) for uid, entry in intake_submissions.items()}

    if not submissions:
        intake_summary = job_payload.get("intakeSummary") or {}
        for entry in intake_summary.get("approvedSubmissions") or []:
            uid = entry.get("submitterId") or entry.get("uid")
            if not uid:
                continue
            submissions[uid] = {
                "status": str(entry.get("status") or "APPROVED").upper(),
                "submittedByName": entry.get("submitterName") or entry.get("name") or entry.get("displayName"),
                "submittedAt": entry.get("submittedAt"),
                "approvedAt": entry.get("approvedAt"),
            }
            if not last_update:
                last_update = entry.get("approvedAt") or entry.get("submittedAt")
        required_count = intake_summary.get("requiredCount")
        if required_count is not None and "totalRequired" not in data_intake:
            data_intake = dict(data_intake or {})
            data_intake["totalRequired"] = required_count

    assigned_lookup: Dict[str, Dict[str, Any]] = {}
    ordered_assigned: List[str] = []
    for member in assigned_crew or []:
        uid = member.get("userId") or member.get("uid") or member.get("id")
        if not uid or uid in assigned_lookup:
            continue
        name = (
            member.get("name")
            or member.get("displayName")
            or member.get("fullName")
            or member.get("email")
            or uid
        )
        assigned_lookup[uid] = {
            "name": name,
            "role": member.get("role"),
            "raw": member,
        }
        ordered_assigned.append(uid)

    if not ordered_assigned and submissions:
        for uid, submission in submissions.items():
            if not uid or uid in assigned_lookup:
                continue
            name = submission.get("submittedByName") or submission.get("displayName") or uid
            assigned_lookup[uid] = {"name": name, "role": None, "raw": submission}
            ordered_assigned.append(uid)

    assigned_ids: List[str] = ordered_assigned

    submitted_ids: List[str] = []
    submitted_names: List[str] = []
    approved_ids: List[str] = []
    approved_names: List[str] = []

    for uid, submission in submissions.items():
        if not uid or uid not in assigned_lookup:
            continue
        status = str(submission.get("status") or "").upper()
        display_name = submission.get("submittedByName") or assigned_lookup[uid]["name"]
        if uid not in submitted_ids:
            submitted_ids.append(uid)
            submitted_names.append(display_name)
        if status == "APPROVED" and uid not in approved_ids:
            approved_ids.append(uid)
            approved_names.append(display_name)
        if not last_update:
            last_update = (
                submission.get("approvedAt")
                or submission.get("submittedAt")
                or submission.get("updatedAt")
            )

    pending_ids = [uid for uid in assigned_ids if uid not in approved_ids]
    pending_names = [assigned_lookup[uid]["name"] for uid in pending_ids]

    required_total = _first_int(
        (data_intake or {}).get("totalRequired"),
        (data_intake or {}).get("requiredCount"),
        (data_intake or {}).get("required"),
        (job_payload.get("intakeSummary") or {}).get("requiredCount"),
        len(assigned_ids),
    )
    if required_total is None:
        required_total = len(assigned_ids)

    approved_count = len(approved_ids)
    submitted_count = len(submitted_ids)
    pending_count = len(pending_ids)

    summary = {
        "assigned": len(assigned_ids),
        "required": required_total,
        "submitted": submitted_count,
        "approved": approved_count,
        "submittedPending": max(submitted_count - approved_count, 0),
        "pending": pending_count,
        "remaining": max(required_total - approved_count, 0),
        "isReady": approved_count >= max(required_total, len(assigned_ids)),
        "submittedNames": submitted_names,
        "approvedNames": approved_names,
        "pendingNames": pending_names,
        "lastUpdate": iso_timestamp(last_update or job_payload.get("updatedAt")),
    }

    return summary
