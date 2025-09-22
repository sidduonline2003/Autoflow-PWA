/**
 * API client for the Post-Production module.
 * Uses JSDoc for IntelliSense.
 */

/**
 * @typedef {object} Deliverable
 * @property {string} name
 * @property {'photos' | 'video' | 'album' | 'reel'} type
 * @property {string} url
 * @property {'gdrive' | 'dropbox' | 'onedrive' | 'frameio' | 'vimeo' | 'pictime' | 'smugmug' | 'other'} provider
 * @property {'public' | 'org' | 'restricted'} access
 * @property {object} [counts]
 * @property {number} [counts.images]
 * @property {number} [counts.minutes]
 */

/**
 * @typedef {object} SubmissionManifest
 * @property {string} whatChanged
 * @property {Deliverable[]} deliverables
 */

/**
 * @typedef {object} Editor
 * @property {string} uid
 * @property {'LEAD' | 'ASSIST'} role
 * @property {string} [displayName]
 */

import api from '../api.js';

/**
 * Initializes the post-production job for an event.
 * @param {string} eventId
 * @param {object} body - Initialization data.
 * @returns {Promise<any>}
 */
export function initPostprod(eventId, body) {
  return api.post(`/events/${eventId}/postprod/init`, body).then(r => r.data);
}

/**
 * Gets the complete overview of a post-production job.
 * @param {string} eventId
 * @returns {Promise<any>}
 */
export function getOverview(eventId) {
  return api.get(`/events/${eventId}/postprod/overview`).then(r => r.data);
}

/**
 * Gets a post-production job (alias for getOverview for backward compatibility).
 * @param {string} eventId
 * @returns {Promise<any>}
 */
export function getJob(eventId) {
  return getOverview(eventId);
}

/**
 * Assigns editors to a stream.
 * @param {string} eventId
 * @param {'photo' | 'video'} stream
 * @param {{ editors: Editor[], draftDueAt: string, finalDueAt: string, useAISuggest?: boolean }} body
 * @returns {Promise<any>}
 */
export function assignEditors(eventId, stream, body) {
  const payload = {
    editors: body.editors,
    draft_due: body.draftDueAt,
    final_due: body.finalDueAt,
    ai_suggest: !!body.useAISuggest,
  };
  return api.post(`/events/${eventId}/postprod/${stream}/assign`, payload).then(r => r.data);
}

/**
 * Marks a stream as started.
 * @param {string} eventId
 * @param {'photo' | 'video'} stream
 * @returns {Promise<any>}
 */
export function startStream(eventId, stream) {
  return api.post(`/events/${eventId}/postprod/${stream}/start`).then(r => r.data);
}

/**
 * Submits a manifest of deliverables for a stream.
 * NOTE: Backend expects: { version, kind: 'draft'|'final', what_changed, deliverables: object }
 * @param {string} eventId
 * @param {'photo' | 'video'} stream
 * @param {{ version: number, kind: 'draft'|'final', whatChanged: string, deliverables: any }} manifest
 * @returns {Promise<any>}
 */
export function submitManifest(eventId, stream, manifest) {
  const payload = {
    version: manifest.version,
    kind: manifest.kind,
    what_changed: manifest.whatChanged,
    deliverables: manifest.deliverables,
  };
  return api.post(`/events/${eventId}/postprod/${stream}/submit`, payload).then(r => r.data);
}

/**
 * Submits a review decision for a stream.
 * @param {string} eventId
 * @param {'photo' | 'video'} stream
 * @param {{ decision: 'APPROVE_FINAL' | 'REQUEST_CHANGES', changeList?: string[], nextDueAt?: string }} body
 * @returns {Promise<any>}
 */
export function decideReview(eventId, stream, body) {
  const payload = {
    decision: body.decision === 'APPROVE_FINAL' ? 'approve' : 'changes',
    change_list: body.changeList,
    next_due: body.nextDueAt,
  };
  return api.post(`/events/${eventId}/postprod/${stream}/review`, payload).then(r => r.data);
}

/**
 * Extends the due date for a stream.
 * @param {string} eventId
 * @param {'photo' | 'video'} stream
 * @param {{ draftDueAt?: string, finalDueAt?: string }} body
 * @returns {Promise<any>}
 */
export function extendDue(eventId, stream, body) {
  return api.patch(`/events/${eventId}/postprod/due`, body).then(r => r.data);
}

/**
 * Reassigns editors for a stream.
 * @param {string} eventId
 * @param {'photo' | 'video'} stream
 * @param {{ editors: Editor[], draftDueAt?: string, finalDueAt?: string }} body
 * @returns {Promise<any>}
 */
export function reassignEditors(eventId, stream, body) {
  const payload = {
    editors: body.editors,
    // If dates are provided, pass through using backend keys; otherwise backend model requires them on reassign
    ...(body.draftDueAt ? { draft_due: body.draftDueAt } : {}),
    ...(body.finalDueAt ? { final_due: body.finalDueAt } : {}),
    ai_suggest: false,
  };
  return api.post(`/events/${eventId}/postprod/${stream}/reassign`, payload).then(r => r.data);
}

/**
 * Waives a stream for an event.
 * @param {string} eventId
 * @param {'photo' | 'video'} stream
 * @returns {Promise<any>}
 */
export function waiveStream(eventId, stream) {
  return api.post(`/events/${eventId}/postprod/${stream}/waive`).then(r => r.data);
}

/**
 * Gets the activity feed for a post-production job.
 * @param {string} eventId
 * @returns {Promise<any>}
 */
export function getActivity(eventId) {
    return api.get(`/events/${eventId}/postprod/activity`).then(r => r.data);
}

/**
 * Adds a note to the activity feed.
 * @param {string} eventId
 * @param {{ summary: string, stream?: 'photo' | 'video' }} body
 * @returns {Promise<any>}
 */
export function addNote(eventId, body) {
    return api.post(`/events/${eventId}/postprod/activity/note`, body).then(r => r.data);
}
