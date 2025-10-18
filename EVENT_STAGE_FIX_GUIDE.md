## Quick Fix for Event Stage Issue

### Problem
Event `GLF7OfG85TVPpGfFSbd8` has:
- ✅ All submissions approved (1/1)
- ✅ `dataIntake.status` = `READY_FOR_POST_PROD`
- ❌ `postProduction.stage` = `DATA_COLLECTION` (should be `READY_FOR_JOB`)

### Root Cause
The data approval code was updating the event in the **client subcollection** but NOT mirroring to the **root events collection**. The post-production init reads from root collection, so it sees stale data.

### Fix Applied to Code
✅ Updated `backend/routers/data_submissions.py` to mirror updates to root events collection
✅ Added debug logging to `backend/routers/postprod.py` to diagnose stage issues
✅ Backend restarted with new code

### Manual Fix for Existing Event

**Option 1: Re-approve the Submission (Easiest)**
1. Go to Data Manager Dashboard
2. Find the event's submission
3. Un-approve it (if possible) or just approve it again
4. With the new code, this will update both collections
5. Try initializing post-production again

**Option 2: Direct Firestore Update (Firebase Console)**
1. Open Firebase Console → Firestore Database
2. Navigate to: `organizations/{orgId}/events/GLF7OfG85TVPpGfFSbd8`
3. Edit the document
4. Add/Update these fields:
   ```
   postProduction:
     stage: "READY_FOR_JOB"
     readyAt: <current timestamp>
   ```
5. Save
6. Refresh your app and try initializing post-production

**Option 3: API Call (Using curl)**
```bash
# This would require creating a custom endpoint to fix the stage
# Not implemented yet
```

### Testing the Fix
1. Refresh the post-production page for event `GLF7OfG85TVPpGfFSbd8`
2. Click to initialize post-production
3. Should see in backend logs:
   ```
   [POSTPROD INIT] Current stage: 'READY_FOR_JOB'
   [POSTPROD INIT] Expected stage: 'READY_FOR_JOB'
   ```
4. Initialization should succeed! ✅

### Prevention
For future events, the updated code will:
- Update BOTH client subcollection AND root events collection when approving
- Ensure stage is always synchronized
- No manual fixes needed
