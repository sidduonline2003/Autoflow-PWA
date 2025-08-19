export function normalizeRole(raw) {
  if (!raw) return undefined;
  const r = String(raw).toLowerCase().trim();
  if (r === 'admin' || r === 'owner') return 'admin';
  if (r === 'client' || r === 'customer') return 'client';
  if (['data-manager', 'datamanager', 'data_manager', 'data manager'].includes(r)) return 'data-manager';
  if (['crew', 'staff'].includes(r)) return 'crew';
  if (['editor', 'post', 'postproduction', 'post-production'].includes(r)) return 'editor';
  return r;
}
