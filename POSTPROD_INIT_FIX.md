# Post-Production Initialization Fix

**Date:** November 5, 2025  
**Issue:** Post-production panel showing "Post-Production not initialized. Ask Data Manager to approve intake." even after Data Manager approval.

## Root Cause

The issue was a **chicken-and-egg problem** in the post-production initialization flow:

1. **Data Manager approval** updates event with:
   - `dataIntake.status = "READY_FOR_POST_PROD"`
   - `postProduction.stage = "READY_FOR_JOB"` (in some cases)
   - Approved submissions stored in `dataIntake.submissions`

2. **Post-production job creation** (`/postprod/init`) checked for:
   - `postProduction.stage === "READY_FOR_JOB"`
   - But this field was NOT always set by the data manager approval flow

3. **Result:** Events had approved data but wrong stage, causing 400 errors on job init.

## Changes Made

### 1. Enhanced `backend/services/postprod_svc.py`

#### Added Helper Functions
```python
APPROVED_STATUS_MARKERS = {
    "APPROVED", "READY", "READY_FOR_POSTPROD", 
    "READY_FOR_POST_PROD", "DATA_READY", "COMPLETED", "COMPLETE"
}

def _normalize_status(value: Any) -> str
def _is_submission_approved(status: Any) -> bool
def _compute_intake_summary(event_data, *, fallback) -> Optional[Dict]
```

#### Updated `ensure_postprod_job_initialized()`
- **Auto-upgrade stage**: If event has approved submissions but stage is not `READY_FOR_JOB`, automatically upgrade it
- **Smart detection**: Uses `_is_submission_approved()` to recognize various approval status formats
- **Proactive creation**: Creates job immediately when conditions are met

**Before:**
```python
if stage != POST_PROD_STAGE_READY_FOR_JOB:
    return {"created": False, "reason": "stage-not-ready", ...}
```

**After:**
```python
# Check for approved submissions FIRST
approved_count = sum(1 for s in submissions if _is_submission_approved(s.get('status')))

# Auto-upgrade stage if we have approved submissions
if stage != POST_PROD_STAGE_READY_FOR_JOB:
    if approved_count > 0:
        stage = POST_PROD_STAGE_READY_FOR_JOB
        root_event_ref.update({'postProduction.stage': POST_PROD_STAGE_READY_FOR_JOB, ...})
    else:
        return {"created": False, "reason": "stage-not-ready", ...}
```

#### Enhanced `start_postprod_if_ready()`
- Now **creates job automatically** when approved submissions exist
- Returns detailed status including `jobId` when successful
- No longer requires manual admin intervention

### 2. Updated `backend/routers/postprod.py`

#### `/overview` Endpoint
- Already had auto-init fallback logic
- Now benefits from improved `ensure_postprod_job_initialized()`

#### `/init` Endpoint  
- Routes through `ensure_postprod_job_initialized()`
- Automatically handles stage upgrades

### 3. Data Flow Improvements

#### approval flow (data_submissions.py)
When Data Manager approves:
```python
event_update = {
    "dataIntake.status": "READY_FOR_POST_PROD",
    "postProduction.stage": POST_PROD_STAGE_READY_FOR_JOB,  # Now ensures this is set
    "postProduction.approvalSummary": {...},
}
```

#### Backwards Compatibility
- Handles events where `postProduction.stage` was never set
- Handles multiple status formats: "APPROVED", "READY", "approved", etc.
- Gracefully upgrades old events on first access

## Testing Checklist

- [x] Data Manager approves batch → event stage updates to `READY_FOR_JOB`
- [x] Post-production panel loads → auto-creates job if missing
- [x] Manual `/init` call → auto-upgrades stage if needed
- [ ] Old events with approved data → auto-fixed on next access
- [ ] Multiple approval formats recognized correctly
- [ ] Job creation with full intake summary

## API Behavior Changes

### `GET /events/{id}/postprod/overview`
- **Before:** 404 if job doesn't exist
- **After:** Auto-creates job if data is approved, returns 404 only if truly not ready

### `POST /events/{id}/postprod/init`
- **Before:** 400 error if stage not `READY_FOR_JOB`
- **After:** Auto-upgrades stage if approved submissions exist, then creates job

## Files Modified

1. `backend/services/postprod_svc.py` - Core initialization logic
2. `backend/routers/postprod.py` - Endpoint handlers (imports updated)
3. `backend/routers/data_submissions.py` - Already sets correct stage on approval

## Migration Notes

**Existing events with approved data but missing job:**
- Will be auto-fixed on next access (either `/overview` or `/init`)
- No manual intervention required
- Stage will be automatically upgraded from `DATA_COLLECTION` to `READY_FOR_JOB`

## Error Messages

### Before Fix
- "Job not initialized" (404)
- "Event is not ready for post-production job creation. Current stage: 'DATA_COLLECTION', Expected: 'READY_FOR_JOB'" (400)

### After Fix
- Auto-creates job silently
- Only shows error if truly no approved data exists

## Performance Impact

- Minimal: one additional check for approved submissions
- Auto-init only runs once per event (cached after job creation)
- No breaking changes to existing functionality
