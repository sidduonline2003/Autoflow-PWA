import { isDate } from 'date-fns';

const toLower = (value) => (typeof value === 'string' ? value.toLowerCase() : value);

const coerceString = (value) => {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    if (typeof value.label === 'string') return value.label;
    if (typeof value.name === 'string') return value.name;
  }
  return null;
};

const detectSubmissionKind = (activity, metadata = {}) => {
  const candidates = [
    activity?.submissionKind,
    activity?.submission_kind,
    activity?.manifestKind,
    metadata?.submissionKind,
    metadata?.submission_kind,
    metadata?.manifestKind,
    metadata?.manifest_kind,
    metadata?.kind,
    metadata?.type,
    metadata?.payload?.kind,
    metadata?.payload?.submissionKind,
    metadata?.payload?.submission_kind
  ];

  const value = candidates.map(coerceString).find(Boolean);
  if (!value) return null;

  const normalized = toLower(value).replace(/[^a-z0-9]/gi, '');
  if (!normalized) return null;

  if (normalized.includes('draft')) return 'draft';
  if (normalized.includes('final')) return 'final';
  if (normalized.includes('revision')) return 'revision';
  if (normalized.includes('review')) return 'review';

  return toLower(value);
};

const detectLane = (kind, metadata = {}, actor = '') => {
  const metaRole = toLower(
    metadata?.actorRole ||
    metadata?.actor_type ||
    metadata?.actorType ||
    metadata?.role ||
    metadata?.source ||
    ''
  );

  const actorLower = toLower(actor || '');

  if (metaRole?.includes?.('admin') || actorLower?.includes?.('admin')) {
    return 'admin';
  }
  if (metaRole?.includes?.('editor') || actorLower?.includes?.('editor')) {
    return 'editor';
  }

  const upperKind = kind?.toUpperCase?.() || '';

  if (['SUBMIT', 'NOTE', 'START'].includes(upperKind)) {
    return 'editor';
  }
  if (['REVIEW', 'REQUEST_CHANGES', 'CHANGES', 'APPROVE', 'WAIVE'].includes(upperKind) || metadata?.decision) {
    return 'admin';
  }
  if (['ASSIGN', 'REASSIGN'].includes(upperKind)) {
    return 'admin';
  }

  return 'system';
};

export const parseTimestamp = (value) => {
  if (!value) return null;
  if (isDate(value)) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  if (typeof value === 'number') {
    return new Date(value);
  }
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      try {
        return value.toDate();
      } catch (error) {
        // fallthrough
      }
    }
    if (value.seconds != null) {
      return new Date(value.seconds * 1000);
    }
    if (value._seconds != null) {
      return new Date(value._seconds * 1000);
    }
    if (value.nanoseconds != null && value.seconds != null) {
      return new Date(value.seconds * 1000 + value.nanoseconds / 1_000_000);
    }
  }
  return null;
};

export const normalizeActivities = (rawActivities) => {
  if (!rawActivities) return [];

  let activitiesArray = [];
  if (Array.isArray(rawActivities)) {
    activitiesArray = rawActivities;
  } else if (typeof rawActivities === 'object') {
    activitiesArray = rawActivities.items || Object.values(rawActivities);
  }

  return activitiesArray
    .map((item, index) => {
      if (!item) return null;
      const kindRaw = item.kind || item.type || item.action || item.eventType;
      const kind = kindRaw ? String(kindRaw).toUpperCase() : 'NOTE';
      const timestamp = parseTimestamp(item.at || item.timestamp || item.lastUpdate || item.createdAt || item.updatedAt);
      const versionRaw = item.version ?? item.versionNumber ?? item.metadata?.version ?? item.metadata?.versionNumber;
      const version = versionRaw != null && !Number.isNaN(Number(versionRaw)) ? Number(versionRaw) : null;
      const stream = item.stream ?? item.metadata?.stream ?? null;
      const metadata = {
        ...(item.metadata || {}),
        ...(item.extra || {})
      };

      if (item.changeList && !metadata.changeList) {
        metadata.changeList = item.changeList;
      }
      if (item.decision && !metadata.decision) {
        metadata.decision = item.decision;
      }

      const submissionKind = detectSubmissionKind(item, metadata);
      if (submissionKind && !metadata.submissionKind) {
        metadata.submissionKind = submissionKind;
      }

      return {
        id: item.id || `${index}-${kind}`,
        kind,
        timestamp,
        version,
        summary: item.summary || item.message || item.description || '',
        actor: item.actorName || item.userName || item.user || item.actorUid || '',
        stream,
        metadata,
        lane: detectLane(kind, metadata, item.actorName || item.userName || item.user || item.actorUid || '')
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const timeA = a.timestamp ? a.timestamp.getTime() : 0;
      const timeB = b.timestamp ? b.timestamp.getTime() : 0;
      return timeB - timeA;
    });
};

export const groupActivitiesByStream = (normalizedActivities) => {
  const grouped = {
    photo: [],
    video: [],
    all: normalizedActivities || []
  };

  (normalizedActivities || []).forEach((activity) => {
    const key = activity?.stream === 'video' ? 'video' : activity?.stream === 'photo' ? 'photo' : null;
    if (key) {
      grouped[key].push(activity);
    }
  });

  return grouped;
};

export const buildChangeHistory = (streamData) => {
  if (!streamData) return [];

  const entries = [];

  if (Array.isArray(streamData.changes)) {
    streamData.changes.forEach((change, index) => {
      if (!change) return;
      entries.push({
        timestamp: parseTimestamp(change.at || change.createdAt || change.updatedAt),
        version: change.version ?? null,
        changeList: change.changeList || change.items || [],
        nextDue: change.nextDue || change.nextDueAt || null,
        actor: change.actor,
        lane: 'admin'
      });
    });
  }

  if (!entries.length && Array.isArray(streamData.changeList) && streamData.changeList.length > 0) {
    entries.push({
      timestamp: parseTimestamp(streamData.nextDue) || parseTimestamp(streamData.lastSubmissionAt),
      version: streamData.version ?? null,
      changeList: streamData.changeList,
      nextDue: streamData.nextDue || null,
      lane: 'admin'
    });
  }

  return entries;
};
