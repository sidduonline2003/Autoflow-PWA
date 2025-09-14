/** Post-production API client (JS version) */
import api from '../api';

/**
 * @typedef {'photo'|'video'} Stream
 * @typedef {'LEAD'|'ASSIST'} Role
 * @typedef {'approve'|'changes'} Decision
 */

/**
 * @typedef {Object} AssignIn
 * @property {{uid:string, role:Role, displayName?:string}[]} editors
 * @property {string} draft_due ISO datetime
 * @property {string} final_due ISO datetime
 * @property {boolean=} ai_suggest
 */

/**
 * @typedef {Object} SubmitIn
 * @property {number} version
 * @property {'draft'|'final'} kind
 * @property {string} what_changed
 * @property {Object.<string, any>} deliverables
 */

/**
 * @typedef {Object} ReviewIn
 * @property {Decision} decision
 * @property {string[]=} change_list
 * @property {string=} next_due
 */

export const getJob = async (eventId) => {
  const { data } = await api.get(`/postprod/events/${eventId}`);
  return data;
};

export const assignEditors = async (eventId, stream, payload) => {
  const { data } = await api.post(`/postprod/events/${eventId}/${stream}/assign`, payload);
  return data;
};

export const submitVersion = async (eventId, stream, payload) => {
  const { data } = await api.post(`/postprod/events/${eventId}/${stream}/submit`, payload);
  return data;
};

export const reviewVersion = async (eventId, stream, payload) => {
  const { data } = await api.post(`/postprod/events/${eventId}/${stream}/review`, payload);
  return data;
};

export const reassignEditors = async (eventId, stream, payload) => {
  const { data } = await api.post(`/postprod/events/${eventId}/${stream}/reassign`, payload);
  return data;
};

export const waiveStream = async (eventId, stream) => {
  const { data } = await api.post(`/postprod/events/${eventId}/${stream}/waive`, {});
  return data;
};

export const getActivity = async (eventId, limit = 50, cursor) => {
  const { data } = await api.get(`/postprod/events/${eventId}/activity`, { params: { limit, cursor } });
  return data;
};

export const addNote = async (eventId, payload) => {
  const { data } = await api.post(`/postprod/events/${eventId}/activity/note`, payload);
  return data;
};

const postprodApi = { getJob, assignEditors, submitVersion, reviewVersion, reassignEditors, waiveStream, getActivity, addNote };
export default postprodApi;
