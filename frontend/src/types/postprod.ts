/** Post-production stream types */
export type Stream = "photo" | "video";
/** Role assigned to an editor within a stream */
export type Role = "LEAD" | "ASSIST";
/** Review decision for a submitted version */
export type Decision = "approve" | "changes";

/** Reference to an editor participating in a stream */
export interface EditorRef { uid: string; role: Role; /** Optional display name for UI */ displayName?: string }

/** Summary of the most recent submission */
export interface LastSubmission { version: number; at: string; whatChanged: string }

/** Runtime state for a single stream */
export interface StreamState {
  /** Current lifecycle state constant (PHOTO_* or VIDEO_*) */
  state: string;
  /** Draft deliverable due date (ISO) */
  draftDue?: string;
  /** Final deliverable due date (ISO) */
  finalDue?: string;
  /** Assigned editors (exactly one LEAD) */
  editors: EditorRef[];
  /** Latest accepted version index (0 before first submission) */
  version: number;
  /** Last submission metadata for quick display */
  lastSubmission?: LastSubmission;
  /** True if this stream was waived */
  waived?: boolean;
}

/** Aggregate job document for both streams */
export interface PostprodJob {
  /** Overall status of the job */
  status: "POST_PRODUCTION_INIT" | "IN_PROGRESS" | "EVENT_DONE";
  /** Waiver flags per stream */
  waived: { photo: boolean; video: boolean };
  /** Photo stream state container */
  photo: StreamState;
  /** Video stream state container */
  video: StreamState;
  /** Last update timestamp (ISO) */
  updatedAt: string;
}
