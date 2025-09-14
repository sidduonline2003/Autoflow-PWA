import api from './api';
import { PostprodJob, Stream } from '../types/postprod';

export interface AssignIn { editors: { uid: string; role: 'LEAD' | 'ASSIST'; displayName?: string }[]; draft_due: string; final_due: string; ai_suggest?: boolean }
export interface SubmitIn { version: number; kind: 'draft' | 'final'; what_changed: string; deliverables: Record<string, any> }
export interface ReviewIn { decision: 'approve' | 'changes'; change_list?: string[]; next_due?: string }

export const getJob = async (eventId: string): Promise<PostprodJob> => {
  const { data } = await api.get(`/postprod/events/${eventId}`);
  return data;
};

export const assignEditors = async (eventId: string, stream: Stream, payload: AssignIn) => {
  const { data } = await api.post(`/postprod/events/${eventId}/${stream}/assign`, payload);
  return data;
};

export const submitVersion = async (eventId: string, stream: Stream, payload: SubmitIn) => {
  const { data } = await api.post(`/postprod/events/${eventId}/${stream}/submit`, payload);
  return data;
};

export const reviewVersion = async (eventId: string, stream: Stream, payload: ReviewIn) => {
  const { data } = await api.post(`/postprod/events/${eventId}/${stream}/review`, payload);
  return data;
};

export const reassignEditors = async (eventId: string, stream: Stream, payload: AssignIn) => {
  const { data } = await api.post(`/postprod/events/${eventId}/${stream}/reassign`, payload);
  return data;
};

export const waiveStream = async (eventId: string, stream: Stream) => {
  const { data } = await api.post(`/postprod/events/${eventId}/${stream}/waive`, {});
  return data;
};

// Activity endpoints (backend to implement)
export const getActivity = async (eventId: string, limit: number = 50, cursor?: string) => {
  const { data } = await api.get(`/postprod/events/${eventId}/activity`, { params: { limit, cursor } });
  return data;
};

export const addNote = async (eventId: string, payload: { summary: string; stream?: Stream }) => {
  const { data } = await api.post(`/postprod/events/${eventId}/activity/note`, payload);
  return data;
};

export default { getJob, assignEditors, submitVersion, reviewVersion, reassignEditors, waiveStream, getActivity, addNote };
