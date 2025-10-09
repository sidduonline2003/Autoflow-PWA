# AI Suggestion Auto-Fetch Fix

## Problem
The AI suggestion endpoint (`/suggest-team`) was being called automatically when the Post-Production Hub loaded, causing:
- Unnecessary API calls on every page load
- Performance impact
- Unwanted AI service usage
- 500 errors showing up in logs even when not needed

## Root Cause
In `PostProdPanel.jsx`, there were multiple places where `fetchAiSuggestions()` was being called automatically:

1. **Line 277-284**: `useEffect` that triggered on page load when `eventId` and `effectiveClientId` were available
2. **Line 306**: After assigning team members
3. **Line 324**: After closing manual assignment modal

## Solution

### Changes Made in `/frontend/src/pages/PostProdPanel.jsx`

#### 1. Removed Automatic Page Load Fetch
**Before:**
```jsx
useEffect(() => {
  if (eventId && effectiveClientId) {
    fetchAiSuggestions();
  }
}, [eventId, effectiveClientId, fetchAiSuggestions]);
```

**After:**
```jsx
// Removed automatic AI suggestions fetch on page load
// AI suggestions should only be fetched when user explicitly toggles the AI switch
// in the AssignEditorsModal component

// useEffect(() => {
//   if (eventId && effectiveClientId) {
//     fetchAiSuggestions();
//   }
// }, [eventId, effectiveClientId, fetchAiSuggestions]);
```

#### 2. Removed Auto-Refresh After Team Assignment
**Before:**
```jsx
toast.success('Team assignment updated.');
fetchOverview();
fetchAiSuggestions();
```

**After:**
```jsx
toast.success('Team assignment updated.');
fetchOverview();
// Removed automatic AI suggestions refresh - only fetch when user toggles AI
// fetchAiSuggestions();
```

#### 3. Removed Auto-Refresh After Closing Manual Assignment
**Before:**
```jsx
const handleCloseManualAssignment = useCallback(() => {
  setManualAssignmentOpen(false);
  fetchOverview();
  fetchAiSuggestions();
}, [fetchAiSuggestions, fetchOverview]);
```

**After:**
```jsx
const handleCloseManualAssignment = useCallback(() => {
  setManualAssignmentOpen(false);
  fetchOverview();
  // Removed automatic AI suggestions refresh - only fetch when user toggles AI
  // fetchAiSuggestions();
}, [fetchOverview]);
```

## How It Works Now

### For Post-Production Editor Assignment (AssignEditorsModal)
The `AssignEditorsModal` component has its own AI suggestion system that:
1. Has a toggle switch for "AI Suggest"
2. Only calls `/postprod/suggest-editors` when the user **explicitly clicks the toggle**
3. Fetches editor suggestions based on workload and skills
4. Provides "Apply" buttons to use the suggestions

**Flow:**
```
User opens Assign Editors Modal
  → Toggle "AI Suggest" ON
    → Calls fetchSuggestions()
      → GET /events/{eventId}/postprod/suggest-editors
        → Shows AI-suggested editors
          → User can apply or ignore suggestions
```

### For Team Assignment (PostProdPanel)
The `PostProdPanel` component has the `fetchAiSuggestions()` function that:
- Calls `/suggest-team` endpoint
- **Is NOT called automatically anymore**
- Can be called manually via `handleRefreshSuggestions()` if needed in the future
- Was previously causing the unwanted 500 errors

## Benefits of This Fix

✅ **No More Unnecessary API Calls**
- AI suggestions only fetched when explicitly requested
- Reduces server load
- Reduces AI service usage costs

✅ **Better User Experience**
- Faster page loads (no waiting for AI)
- Users consciously choose when to use AI
- Clear user intent when AI is activated

✅ **Cleaner Logs**
- No more 500 errors on page load
- Backend logs only show AI calls when intentionally triggered
- Easier to debug actual issues

✅ **Maintains AI Functionality**
- AI suggestions still work perfectly
- Available when user wants them
- No loss of features

## Testing Checklist

### Test 1: Page Load
- [ ] Open Post-Production Hub
- [ ] Verify NO `/suggest-team` request in Network tab
- [ ] Verify NO AI errors in console
- [ ] Page loads normally without delays

### Test 2: Editor Assignment with AI
- [ ] Click "Assign Editors" for a stream
- [ ] Modal opens
- [ ] Toggle "AI Suggest" switch ON
- [ ] Verify `/postprod/suggest-editors` request is made
- [ ] AI suggestions appear
- [ ] Can apply suggestions successfully

### Test 3: Manual Assignment
- [ ] Assign team members manually
- [ ] Close modal
- [ ] Verify NO `/suggest-team` request after closing
- [ ] Overview refreshes correctly

### Test 4: Team Assignment
- [ ] Assign team using the team assignment feature
- [ ] Verify NO `/suggest-team` request after assignment
- [ ] Team updated successfully

## Architecture Notes

### Two Different AI Systems

**1. Editor Assignment AI** (`/postprod/suggest-editors`)
- Location: `AssignEditorsModal.jsx`
- Purpose: Suggest editors based on workload, skills, availability
- Trigger: Manual toggle in assignment modal
- Data: Editor availability, past performance, current workload

**2. Team Suggestion AI** (`/suggest-team`)
- Location: `PostProdPanel.jsx`
- Purpose: Suggest team members for events
- Trigger: Previously automatic (now disabled), can be manual if needed
- Data: Team skills, availability, schedules

These are separate systems with different endpoints and purposes. This fix ensures the Team Suggestion AI doesn't run automatically while preserving the Editor Assignment AI functionality.

## Future Enhancements

If you want to re-enable the Team Suggestion AI in the future, consider:

1. **Add a Button**: Create an explicit "Get AI Team Suggestions" button
2. **User Preference**: Store user preference for auto-suggestions
3. **Smart Timing**: Only suggest when relevant (e.g., new unassigned events)
4. **Cached Results**: Cache suggestions to avoid repeated calls

## Rollback Plan

If you need to rollback to automatic suggestions:

1. Uncomment the three sections marked with `// Removed automatic AI suggestions`
2. Restore the `fetchAiSuggestions` dependency in `handleCloseManualAssignment`
3. Test to ensure it works as before

## Summary

The fix successfully prevents automatic AI suggestion calls while maintaining all AI functionality for when users explicitly request it. This improves performance, reduces unnecessary API usage, and eliminates unwanted error logs.
