// Post-production API wrappers
// Uses the shared Axios instance `api` from src/api.js

import api from '../api';

// Primitive types
export type StreamType = 'photos' | 'video';
export type Role = 'LEAD' | 'ASSIST';

export type DeliverableType = 'photos' | 'video' | 'album' | 'reel';
export type AccessType = 'public' | 'org' | 'restricted';
export type Provider = 'gdrive' | 'dropbox' | 'onedrive' | 'frameio' | 'vimeo' | 'pictime' | 'smugmug' | 'other';

// Core models
export interface Deliverable {
  name: string;
  type: DeliverableType;
  url: string;
  provider: Provider;
  access: AccessType;
  counts?: { images?: number; minutes?: number };
  notes?: string;
}

export interface SubmissionManifest {
  deliverables: Deliverable[];
  whatChanged: string;
}

export interface Editor {
  uid: string;
  displayName?: string;
  role: Role;
}

export interface StreamSummary {
  type: StreamType;
  state: string; // e.g., 'PHOTO_ASSIGNED'
  editors: Editor[];
  draftDueAt?: string;
  finalDueAt?: string;
  version: number;
  lastSubmissionId?: string | null;
  risk?: { atRisk: boolean; reason?: string };
  metrics?: {
    assignedAt?: string;
    firstSubmitAt?: string;
    approvedAt?: string;
    revisionRounds?: number;
    onTimeDraft?: boolean;
    onTimeFinal?: boolean;
  };
}

export interface OverviewResponse {
  photos?: StreamSummary;
  video?: StreamSummary;
  activity?: any[];
}

// Request shapes
export interface InitBody {
  orgId: string;
  clientId: string;
  useAISuggest?: boolean;
}

export interface AssignEditorsBody {
  editors: Editor[];
  draftDueAt: string; // ISO
  finalDueAt: string; // ISO
  useAISuggest?: boolean;
}

export interface DecideReviewBody {
  decision: 'APPROVE_FINAL' | 'REQUEST_CHANGES';
  changeList?: string[];
  nextDueAt?: string; // ISO
}

export interface ExtendDueBody {
  draftDueAt?: string; // ISO
  finalDueAt?: string; // ISO
}

export interface ReassignEditorsBody {
  editors: Editor[];
}

// API helpers
const base = (eventId: string) => `/api/events/${eventId}/postprod`;

export async function initPostprod(eventId: string, body: InitBody) {
  const { data } = await api.post(`${base(eventId)}/init`, body, { baseURL: '' });
  return data as { ok: boolean } | unknown;
}

export async function getOverview(eventId: string): Promise<OverviewResponse> {
  const { data } = await api.get<OverviewResponse>(`${base(eventId)}/overview`, { baseURL: '' });
  return data;
}

export async function assignEditors(
  eventId: string,
  stream: StreamType,
  body: AssignEditorsBody
) {
  const { data } = await api.post(`${base(eventId)}/${stream}/assign`, body, { baseURL: '' });
  return data as { ok: boolean } | unknown;
}

export async function startStream(eventId: string, stream: StreamType) {
  const { data } = await api.post(`${base(eventId)}/${stream}/start`, {}, { baseURL: '' });
  return data as { ok: boolean } | unknown;
}

export async function submitManifest(
  eventId: string,
  stream: StreamType,
  manifest: SubmissionManifest
) {
  const { data } = await api.post(`${base(eventId)}/${stream}/submit`, manifest, { baseURL: '' });
  return data as { ok: boolean; version?: number } | unknown;
}

export async function decideReview(
  eventId: string,
  stream: StreamType,
  body: DecideReviewBody
) {
  // Transform frontend keys to match backend expectations
  const payload = {
    decision: body.decision === 'APPROVE_FINAL' ? 'approve' : 'changes',
    change_list: body.changeList,
    next_due: body.nextDueAt,
  };
  const { data } = await api.post(`${base(eventId)}/${stream}/review`, payload, { baseURL: '' });
  return data as { ok: boolean; decision: string } | unknown;
}

export async function extendDue(
  eventId: string,
  stream: StreamType,
  body: ExtendDueBody
) {
  const { data } = await api.post(`${base(eventId)}/${stream}/extend-due`, body, { baseURL: '' });
  return data as { ok: boolean } | unknown;
}

export async function reassignEditors(
  eventId: string,
  stream: StreamType,
  body: ReassignEditorsBody
) {
  const { data } = await api.post(`${base(eventId)}/${stream}/reassign`, body, { baseURL: '' });
  return data as { ok: boolean } | unknown;
}

export async function waiveStream(eventId: string, stream: StreamType) {
  const { data } = await api.post(`${base(eventId)}/${stream}/waive`, {}, { baseURL: '' });
  return data as { ok: boolean } | unknown;
}
