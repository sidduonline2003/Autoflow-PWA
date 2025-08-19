import { auth } from '../firebase';

async function getToken() {
  try {
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

export async function authFetch(path, options = {}) {
  const token = await getToken();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', headers.get('Content-Type') || 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    let detail = 'Request failed';
    try { const j = await res.json(); detail = j.detail || JSON.stringify(j); } catch { /* ignore */ }
    throw new Error(detail);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return res.text();
}

export const api = {
  get: (path) => authFetch(path),
  post: (path, body) => authFetch(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => authFetch(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => authFetch(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (path) => authFetch(path, { method: 'DELETE' }),
};
