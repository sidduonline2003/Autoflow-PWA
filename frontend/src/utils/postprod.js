// Runtime helpers for Post-Production flows (JS version)

/** Compute progress percentage for a stream state */
export function progressFor(stream) {
  if (!stream) return 0;
  const s = stream.state || '';
  if (s.endsWith('ASSIGNED')) return 10;
  if (s.endsWith('IN_PROGRESS')) return 40;
  if (s.endsWith('REVIEW') || s.endsWith('SUBMITTED')) return 80;
  if (s.endsWith('DONE')) return 100;
  return 0;
}

/** True if the user is the LEAD among editors */
export function isLead(userId, editors = []) {
  return !!editors.find(e => e.uid === userId && e.role === 'LEAD');
}

export function isAdmin(user) { return user?.role === 'admin'; }

/** Format a due date in Asia/Kolkata */
export function formatDue(dateISO) {
  if (!dateISO) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(dateISO));
  } catch { return dateISO; }
}

/** Validate that text is a strictly numbered list 1.,2.,3. */
export function ensureNumberedList(text) {
  if (!text) return false;
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  return lines.every((l, i) => l.startsWith(`${i + 1}.`));
}
