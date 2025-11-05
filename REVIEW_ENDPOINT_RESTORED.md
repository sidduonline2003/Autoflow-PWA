# Review Endpoint Restored - Complete Fix

## Issue
Admin was getting 404 Not Found when trying to review submitted deliverables:
```
POST /api/events/JvmSJCmYk96rBRZIu9jy/postprod/photo/review HTTP/1.1" 404 Not Found
```

## Root Cause
The review endpoint `@router.post('/{event_id}/postprod/{stream}/review')` was completely missing from `postprod.py` after a previous refactoring. The `ReviewIn` model class existed but had no endpoint using it.

## Solution Implemented

### 1. Restored Review Endpoint
**File**: `backend/routers/postprod.py`

Added the missing review endpoint with two decision paths:

#### Approve Path (`decision='approve'`)
- Marks stream as DONE (PHOTO_DONE or VIDEO_DONE)
- Checks if both streams complete → sets overall status to EVENT_DONE
- Records REVIEW activity with "Approved deliverables" summary
- Syncs state to event document via PostProdSyncService

#### Request Changes Path (`decision='changes'`)
- Sends stream back to IN_PROGRESS state
- Stores change request history with version, timestamp, and change list
- Sets new draft due date (default: 24 hours from now)
- Records REVIEW activity with change count
- Syncs state to event document via PostProdSyncService

### 2. Cleaned Up Dead Code
Removed orphaned waive logic that was unreachable after submit endpoint's return statement (lines 712-722).

## Technical Details

### Endpoint Signature
```python
@router.post('/{event_id}/postprod/{stream}/review')
async def review_stream(
    event_id: str, 
    stream: StreamType, 
    req: ReviewIn, 
    current_user: dict = Depends(get_current_user)
)
```

### Request Model (ReviewIn)
```python
class ReviewIn(BaseModel):
    decision: str  # 'approve' or 'changes'
    change_list: Optional[List[str]] = None  # List of changes requested
    next_due: Optional[datetime] = None  # When revised draft is due
```

### Response Models
**Approve**:
```json
{
  "ok": true,
  "decision": "approve",
  "status": "EVENT_DONE"  // or other status
}
```

**Request Changes**:
```json
{
  "ok": true,
  "decision": "changes",
  "changeCount": 3,
  "nextDue": "2024-01-15T10:30:00",
  "status": "POST_PROD_STAGE_JOB_CREATED"
}
```

### State Transitions

#### On Approve:
```
PHOTO_IN_REVIEW → PHOTO_DONE
VIDEO_IN_REVIEW → VIDEO_DONE
```

#### On Request Changes:
```
PHOTO_IN_REVIEW → PHOTO_IN_PROGRESS
VIDEO_IN_REVIEW → VIDEO_IN_PROGRESS
```

### Change History Tracking
Each change request is appended to `stream.changes[]`:
```python
{
    'at': '2024-01-14T10:30:00',
    'version': 2,
    'changeList': ['Fix color grading', 'Add transitions', 'Improve audio'],
    'nextDue': '2024-01-15T10:30:00'
}
```

### Integration with PostProdSyncService
The endpoint syncs state changes back to the main event document:
- **action_type**: 'approve' or 'request_changes'
- **metadata**: Includes decision, changeCount, nextDue
- **version_override**: Current submission version

## Authorization
- **Role Required**: `admin`
- **403 Error**: If non-admin tries to access

## Validation
- **404 Error**: Job not initialized
- **400 Error**: Nothing submitted yet (version = 0)

## Testing Checklist

### ✅ Compilation
- [x] Python syntax valid
- [x] No import errors

### 🔲 Functional Testing (To Do)
- [ ] Admin can approve photo deliverables
- [ ] Admin can approve video deliverables
- [ ] Admin can request changes with change list
- [ ] Change history is preserved across multiple revisions
- [ ] Next due date defaults to 24 hours if not provided
- [ ] Event status updates to EVENT_DONE when both streams approved
- [ ] Editor can see requested changes
- [ ] Editor can resubmit after changes

### 🔲 Integration Testing
- [ ] PostProdSyncService updates event document correctly
- [ ] Activity log records review actions
- [ ] Frontend receives correct response format
- [ ] Non-admin gets 403 Forbidden

## Complete Post-Production Workflow

```
1. Data Manager approves intake → Auto-creates job (DATA_COLLECTION → READY_FOR_JOB)
2. Admin initializes post-prod → Creates job document (READY_FOR_JOB → JOB_CREATED)
3. Admin assigns editors → Sets PHOTO_ASSIGNED, VIDEO_ASSIGNED
4. Editors start work → PHOTO_IN_PROGRESS, VIDEO_IN_PROGRESS
5. Editors submit draft → PHOTO_IN_REVIEW, VIDEO_IN_REVIEW
6. Admin reviews submissions:
   - Option A: Approve → PHOTO_DONE, VIDEO_DONE → EVENT_DONE ✅
   - Option B: Request changes → Back to IN_PROGRESS → Editor resubmits → Back to step 6
```

## Files Modified
1. **backend/routers/postprod.py**
   - Added `review_stream()` endpoint (lines 714-827)
   - Removed dead waive code (previously lines 712-722)

## Related Issues Fixed
This completes the fix for the original issue where post-production wasn't initializing after data manager approval:
1. ✅ Auto-stage-upgrade (DATA_COLLECTION → READY_FOR_JOB)
2. ✅ Auto-job-creation when data approved
3. ✅ Review endpoint for admin approval workflow

## Next Steps
1. Test with event `JvmSJCmYk96rBRZIu9jy`
2. Have editor submit photo deliverables
3. Have admin review and test both approve/changes paths
4. Verify change history is accessible to editor
5. Confirm EVENT_DONE status when both streams complete

---
**Date**: 2024-01-14
**Status**: ✅ Code Complete - Ready for Testing
