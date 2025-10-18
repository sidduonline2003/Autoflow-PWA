# 🔧 How to Fix Post-Production 400 Error

## Error Message
```
POST /api/events/GLF7OfG85TVPpGfFSbd8/postprod/init -> 400
Detail: "Event is not ready for post-production job creation"
```

## Root Cause
The event needs **approved data intake submissions** before post-production can begin.

## Solution Steps

### Option 1: Approve Data Submissions (Proper Workflow) ✅

1. **Go to Data Manager Dashboard**
   - Navigate to `/data-manager` or `/data-submissions/dm/dashboard`
   
2. **Find Pending Approvals**
   - Look for submissions with status "PENDING_REVIEW"
   - Should see crew members who submitted their data intake forms

3. **Approve Each Submission**
   - Review equipment info, storage devices, handoff details
   - Click "Approve" button
   - Assign storage medium/location if required

4. **Once ALL Required Submissions Approved**
   - Backend automatically updates: `postProduction.stage = "READY_FOR_JOB"`
   - Event becomes ready for post-production initialization

5. **Return to Post-Production Panel**
   - Refresh the page
   - Click "Initialize Post-Production" 
   - Should work now! ✅

---

### Option 2: Force Initialize (Development/Testing Only) ⚠️

If you need to bypass the approval process for testing:

#### A. Manually Update Firestore

```javascript
// In Firebase Console → Firestore
// Find: organizations/{orgId}/events/{eventId}

// Update these fields:
{
  "postProduction": {
    "stage": "READY_FOR_JOB",
    "readyAt": <current_timestamp>
  },
  "dataIntake": {
    "status": "READY_FOR_POST_PROD"
  }
}
```

#### B. Or Modify Backend Code (Temporary)

In `backend/routers/postprod.py` line 799, temporarily comment out the check:

```python
# TEMPORARY - REMOVE AFTER TESTING
# if stage != POST_PROD_STAGE_READY_FOR_JOB:
#     raise HTTPException(status_code=400, detail='Event is not ready...')
```

**⚠️ Remember to remove this after testing!**

---

## Checking Event Status

To see what's needed:

### In Frontend
1. Go to Data Manager Dashboard
2. Check "Pending Approvals" section
3. See how many submissions need approval

### Via API
```bash
curl http://localhost:8000/api/events/GLF7OfG85TVPpGfFSbd8
```

Look for:
- `dataIntake.submissions` - Should have approved entries
- `postProduction.stage` - Should be "READY_FOR_JOB"
- `postProduction.approvalSummary.required` - How many approvals needed
- `postProduction.approvalSummary.approved` - How many currently approved

---

## Understanding the Stages

```
POST_PROD_STAGE_DATA_COLLECTION  ← Event created, waiting for data
         ↓
POST_PROD_STAGE_READY_FOR_JOB   ← All data approved, can init
         ↓
POST_PROD_STAGE_JOB_CREATED      ← Post-prod job initialized
```

---

## Prevention

For future events, ensure:
1. ✅ Crew members are assigned to event
2. ✅ Crew submit their data intake forms
3. ✅ Data manager approves submissions promptly
4. ✅ Then initialize post-production

This workflow ensures all equipment and storage data is recorded before editing begins.
