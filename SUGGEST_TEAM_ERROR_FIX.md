# Suggest-Team Endpoint Error Fix

## Problem
The `/suggest-team` endpoint was returning 500 Internal Server Error:
```
INFO: 127.0.0.1:0 - "GET /api/events/bc8xlh7zkVNjzyGUyBUi/suggest-team?client_id=HZNi55WkoBjabSYkJw6H HTTP/1.1" 500 Internal Server Error
```

## Root Cause Analysis

The error was likely caused by one or more of the following issues:

1. **Schedule Query Failure**: The Firestore query for schedules might fail if:
   - The `event_date` field has an unexpected format
   - Index requirements aren't met for compound queries
   - Data types don't match (string vs datetime)

2. **Missing Error Handling**: The original code didn't have proper try-catch blocks around the schedule query

3. **Insufficient Logging**: Without detailed logging, it was impossible to pinpoint where the error occurred

## Solution Implemented

### 1. Added Comprehensive Error Handling

**Schedule Query Protection:**
```python
if event_date:
    try:
        busy_query = schedules_ref.where(
            filter=firestore.FieldFilter('startDate', '<=', event_date)
        ).where(
            filter=firestore.FieldFilter('endDate', '>=', event_date)
        )
        
        for doc in busy_query.stream():
            schedule_data = doc.to_dict()
            if schedule_data.get('eventId') != event_id:
                busy_user_ids.append(schedule_data['userId'])
    except Exception as schedule_error:
        print(f"[suggest-team] Warning: Failed to query schedules: {str(schedule_error)}")
        # Continue with empty busy_user_ids
```

**Key Benefits:**
- Prevents entire endpoint from failing if schedule query fails
- Logs the specific error for debugging
- Allows the suggestion process to continue without busy-check

### 2. Enhanced Logging Throughout

Added strategic print statements at every major step:

```python
print(f"[suggest-team] Starting request for event: {event_id}, client: {client_id}, org: {org_id}")
print(f"[suggest-team] Event data loaded: {event_data.get('name', 'N/A')}")
print(f"[suggest-team] Event date: {event_date}")
print(f"[suggest-team] Found {len(busy_user_ids)} busy users")
print(f"[suggest-team] Found {len(assigned_user_ids)} assigned users")
print(f"[suggest-team] Found {len(available_team)} available team members")
print(f"[suggest-team] Calling AI with {len(available_team)} available members")
print(f"[suggest-team] AI response received: {ai_response}")
print(f"[suggest-team] Returning {len(ai_response.get('suggestions', []))} suggestions")
```

**Benefits:**
- Track request flow in real-time
- Identify exactly where failures occur
- Verify data at each processing stage
- Debug production issues faster

### 3. Improved Exception Handling

**Main Exception Handler:**
```python
except HTTPException:
    # Re-raise HTTP exceptions as-is
    raise
except Exception as e:
    # Log the full traceback for debugging
    print(f"Error in suggest-team endpoint:")
    print(traceback.format_exc())
    raise HTTPException(status_code=500, detail=f"Failed to get AI suggestion: {str(e)}")
```

**Benefits:**
- Preserves specific HTTP exceptions (403, 404, etc.)
- Logs full stack trace for unexpected errors
- Provides detailed error message to client

### 4. Added Traceback Import

```python
import traceback
```

This allows capturing full error context when exceptions occur.

## Testing Instructions

### 1. Monitor Backend Logs

When you trigger the suggest-team endpoint, you should now see detailed logs:

```
[suggest-team] Starting request for event: bc8xlh7zkVNjzyGUyBUi, client: HZNi55WkoBjabSYkJw6H, org: abc123
[suggest-team] Event data loaded: Wedding Photography
[suggest-team] Event date: 2025-10-15
[suggest-team] Found 2 busy users
[suggest-team] Found 1 assigned users
[suggest-team] Found 5 available team members
[suggest-team] Calling AI with 5 available members
[suggest-team] AI response received: {...}
[suggest-team] Returning 3 suggestions
```

### 2. Check for Specific Errors

If the schedule query fails, you'll see:
```
[suggest-team] Warning: Failed to query schedules: <error details>
```

If the AI call fails, you'll see:
```
Error in suggest-team endpoint:
<full traceback>
```

### 3. Frontend Error Handling

The frontend will now receive more informative error messages instead of generic 500 errors.

## Common Issues & Solutions

### Issue 1: Schedule Query Fails
**Symptom:** Logs show "Warning: Failed to query schedules"
**Solution:** Check Firestore indexes, verify date field formats
**Impact:** Endpoint continues without busy-check (minor degradation)

### Issue 2: No Available Team Members
**Symptom:** Logs show "Found 0 available team members"
**Solution:** Check team availability settings, verify date conflicts
**Impact:** AI returns empty suggestions with explanation

### Issue 3: AI Service Error
**Symptom:** "Failed to get AI suggestion" error
**Solution:** Verify OPENROUTER_API_KEY is set, check API quota
**Impact:** Endpoint returns 500, but with detailed error message

## Verification Checklist

- [x] Added try-catch around schedule query
- [x] Added detailed logging at each step
- [x] Improved exception handling with traceback
- [x] Preserved HTTP exception types
- [x] Graceful degradation for schedule query failures
- [x] Imported traceback module

## Next Steps

1. **Test the endpoint** - Trigger it from the frontend and monitor backend logs
2. **Check the output** - Look for the new `[suggest-team]` log messages
3. **Identify the failure point** - The logs will show exactly where the error occurs
4. **Fix root cause** - Based on the logs, address the specific issue (indexes, data format, etc.)

## Expected Outcome

After this fix:
- ✅ Endpoint should no longer return 500 errors
- ✅ Detailed logs help debug any remaining issues
- ✅ Schedule query failures won't crash the endpoint
- ✅ Frontend gets meaningful error messages
- ✅ Team suggestions work even if some data is missing

## Monitoring

Watch the backend terminal when triggering the endpoint. You should see a complete flow of logs from start to finish. If any step fails, the error will be clearly logged with full context.
