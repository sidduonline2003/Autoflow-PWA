import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import duration from 'dayjs/plugin/duration';

// Extend dayjs with plugins
dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);
dayjs.extend(duration);

/**
 * Format timestamp with relative and absolute time
 * @param {string|Date} timestamp - The timestamp to format
 * @returns {Object} Object containing relative, absolute, and short formatted times
 */
export const formatTimestamp = (timestamp) => {
  if (!timestamp) {
    return {
      relative: 'Unknown',
      absolute: 'Unknown',
      short: 'Unknown'
    };
  }

  const date = dayjs(timestamp);
  const now = dayjs();
  const diffInHours = now.diff(date, 'hour');
  const diffInDays = now.diff(date, 'day');

  let relativeFormat;
  
  if (diffInHours < 1) {
    // Less than 1 hour: "2 minutes ago"
    relativeFormat = date.fromNow();
  } else if (diffInHours < 24) {
    // Less than 24 hours: "3 hours ago"
    relativeFormat = date.fromNow();
  } else if (diffInDays === 1) {
    // Yesterday: "Yesterday at 3:45 PM"
    relativeFormat = `Yesterday at ${date.format('h:mm A')}`;
  } else if (diffInDays < 7) {
    // Less than 7 days: "Oct 20 at 2:30 PM"
    relativeFormat = date.format('MMM DD [at] h:mm A');
  } else {
    // More than 7 days: "October 15, 2025 at 11:20 AM"
    relativeFormat = date.format('MMMM DD, YYYY [at] h:mm A');
  }

  return {
    relative: relativeFormat,
    absolute: date.format('LLLL'), // "Saturday, October 20, 2025 at 3:45:23 PM"
    short: date.format('MMM DD [at] h:mm A'), // "Oct 20 at 2:30 PM"
    iso: date.toISOString(),
    raw: date
  };
};

/**
 * Calculate the time difference between two dates in a human-readable format
 * @param {string|Date} startTime - Start timestamp
 * @param {string|Date} endTime - End timestamp
 * @returns {string} Formatted duration (e.g., "2 hours 30 minutes")
 */
export const formatDuration = (startTime, endTime) => {
  if (!startTime || !endTime) {
    return 'N/A';
  }

  const start = dayjs(startTime);
  const end = dayjs(endTime);
  const diff = dayjs.duration(end.diff(start));

  const hours = Math.floor(diff.asHours());
  const minutes = diff.minutes();

  if (hours === 0 && minutes === 0) {
    return 'Less than a minute';
  } else if (hours === 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else if (minutes === 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  } else {
    return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
};

/**
 * Check if a timestamp is within the last N days
 * @param {string|Date} timestamp - Timestamp to check
 * @param {number} days - Number of days
 * @returns {boolean}
 */
export const isWithinLastDays = (timestamp, days) => {
  if (!timestamp) return false;
  
  const date = dayjs(timestamp);
  const now = dayjs();
  const diffInDays = now.diff(date, 'day');
  
  return diffInDays <= days;
};

/**
 * Format timestamp for display in a list (compact format)
 * @param {string|Date} timestamp - The timestamp to format
 * @returns {string} Compact formatted time
 */
export const formatCompactTime = (timestamp) => {
  if (!timestamp) return 'Unknown';
  
  const date = dayjs(timestamp);
  const now = dayjs();
  const diffInMinutes = now.diff(date, 'minute');
  const diffInHours = now.diff(date, 'hour');
  const diffInDays = now.diff(date, 'day');

  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  } else if (diffInDays < 7) {
    return `${diffInDays}d ago`;
  } else {
    return date.format('MMM DD');
  }
};

/**
 * Get a color based on how old a timestamp is (for urgency indicators)
 * @param {string|Date} timestamp - The timestamp to check
 * @param {number} warningHours - Hours before showing warning (default: 24)
 * @param {number} dangerHours - Hours before showing danger (default: 48)
 * @returns {string} Color indicator: 'success', 'warning', 'error'
 */
export const getTimestampUrgency = (timestamp, warningHours = 24, dangerHours = 48) => {
  if (!timestamp) return 'default';
  
  const date = dayjs(timestamp);
  const now = dayjs();
  const diffInHours = now.diff(date, 'hour');

  if (diffInHours < warningHours) {
    return 'success';
  } else if (diffInHours < dangerHours) {
    return 'warning';
  } else {
    return 'error';
  }
};
