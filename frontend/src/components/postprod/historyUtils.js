import { isDate } from 'date-fns';

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

      return {
        id: item.id || `${index}-${kind}`,
        kind,
        timestamp,
        version,
        summary: item.summary || item.message || item.description || '',
        actor: item.actorName || item.userName || item.user || item.actorUid || '',
        stream,
        metadata
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
        actor: change.actor
      });
    });
  }

  if (!entries.length && Array.isArray(streamData.changeList) && streamData.changeList.length > 0) {
    entries.push({
      timestamp: parseTimestamp(streamData.nextDue) || parseTimestamp(streamData.lastSubmissionAt),
      version: streamData.version ?? null,
      changeList: streamData.changeList,
      nextDue: streamData.nextDue || null
    });
  }

  return entries;
};
