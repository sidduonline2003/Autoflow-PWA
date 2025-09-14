import { EditorRef, StreamState } from '../types/postprod';

export function progressFor(stream: StreamState): number {
  const s = stream.state || '';
  if (s.endsWith('ASSIGNED')) return 10;
  if (s.endsWith('IN_PROGRESS')) return 40;
  if (s.endsWith('REVIEW') || s.endsWith('SUBMITTED')) return 80;
  if (s.endsWith('DONE')) return 100;
  return 0;
}

export function isLead(userId: string, editors: EditorRef[] = []): boolean {
  return !!editors.find(e => e.uid === userId && e.role === 'LEAD');
}

export function isAdmin(user: any): boolean { return user?.role === 'admin'; }

export function formatDue(dateISO?: string): string {
  if (!dateISO) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(dateISO));
  } catch { return dateISO; }
}

export function ensureNumberedList(text: string): boolean {
  if (!text) return false;
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  return lines.every((l, i) => l.startsWith(`${i + 1}.`));
}
