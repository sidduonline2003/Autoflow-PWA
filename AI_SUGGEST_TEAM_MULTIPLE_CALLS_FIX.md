# AI Suggest Team Multiple Calls Fix

## Problem

When clicking the "AI Suggest Team" button in the Client Workspace page, the `/api/events/{event_id}/suggest-team` endpoint was being called multiple times in rapid succession, causing:

1. **Repeated API calls** - The same request was made 4-5 times consecutively
2. **Performance issues** - Unnecessary load on the backend and OpenRouter AI API
3. **Confusing logs** - Multiple identical log entries making debugging difficult
4. **Poor UX** - Button not clearly showing loading state

### Logs showing the issue:
```
[suggest-team] Starting request for event: JvmSJCmYk96rBRZIu9jy
[suggest-team] Starting request for event: JvmSJCmYk96rBRZIu9jy
[suggest-team] Starting request for event: JvmSJCmYk96rBRZIu9jy
[suggest-team] Starting request for event: JvmSJCmYk96rBRZIu9jy
[suggest-team] Starting request for event: JvmSJCmYk96rBRZIu9jy
```

## Root Causes

### 1. Duplicate Buttons
There were **two separate buttons** calling the same function in `ClientWorkspacePage.js`:

- **Button 1** (Line ~519): In the "Next Actions" section
- **Button 2** (Line ~580): In the CardActions section at the bottom of the event card

When clicking one, the user might accidentally click both, or React re-rendering might trigger both handlers.

### 2. No Debouncing/Guard
The `getAiSuggestions` function had no protection against multiple simultaneous calls for the same event. If the button was clicked rapidly or if there was a re-render, multiple API calls would be made.

### 3. Inconsistent Loading State
The button in the "Next Actions" section wasn't checking the loading state, so it could be clicked multiple times even while a request was in progress.

## Solution

### 1. Added Loading Guard
Added a check at the start of `getAiSuggestions` to prevent multiple simultaneous calls for the same event:

```javascript
const getAiSuggestions = async (eventId) => {
    // Prevent multiple simultaneous calls for the same event
    if (aiLoading[eventId]) {
        console.log(`[AI Suggest] Already loading suggestions for event ${eventId}, skipping...`);
        return;
    }
    
    console.log(`[AI Suggest] Fetching suggestions for event ${eventId}`);
    // ... rest of the function
};
```

### 2. Removed Duplicate Button
Removed the duplicate "Suggest Team" button from the `CardActions` section, keeping only the one in "Next Actions" where it's more contextually appropriate.

**Before:**
- Button in "Next Actions" section
- Duplicate button in CardActions section

**After:**
- Single button in "Next Actions" section only
- "View Details" button remains in CardActions

### 3. Added Loading State to Button
Updated the button in "Next Actions" to properly show loading state and be disabled while fetching:

```javascript
<Button 
    size="small" 
    variant="outlined" 
    onClick={() => getAiSuggestions(event.id)}
    disabled={aiLoading[event.id]}
>
    {aiLoading[event.id] ? 'Getting Suggestions...' : 'AI Suggest Team'}
</Button>
```

### 4. Added Console Logging
Added helpful console logs to track when suggestions are being fetched, helping with debugging:

```javascript
console.log(`[AI Suggest] Fetching suggestions for event ${eventId}`);
console.log(`[AI Suggest] Successfully fetched suggestions for event ${eventId}`);
console.error(`[AI Suggest] Error for event ${eventId}:`, error);
```

## Files Modified

### `/frontend/src/pages/ClientWorkspacePage.js`

1. **Line ~255**: Updated `getAiSuggestions` function with loading guard and logging
2. **Line ~526**: Added loading state and disabled prop to "AI Suggest Team" button
3. **Line ~588**: Removed duplicate "Suggest Team" button from CardActions

## Testing

### Before Fix:
1. Click "AI Suggest Team" button
2. Observe in browser console: Multiple API calls
3. Observe in backend logs: 4-5 identical request logs
4. Button could be clicked multiple times rapidly

### After Fix:
1. Click "AI Suggest Team" button
2. Button immediately shows "Getting Suggestions..." and becomes disabled
3. Only **ONE** API call is made (verify in browser Network tab)
4. Backend logs show only **ONE** request
5. Button cannot be clicked again until request completes
6. Console shows clear logging: "Fetching", "Successfully fetched", or "Error"

## Verification Checklist

- [x] Remove duplicate button from CardActions
- [x] Add loading guard to prevent simultaneous calls
- [x] Add disabled state to button during loading
- [x] Update button text to show loading state
- [x] Add console logging for debugging
- [x] Test: Click button once - only one API call
- [x] Test: Try rapid clicks - only first click works
- [x] Test: Button shows "Getting Suggestions..." during load
- [x] Test: Button is disabled during load
- [x] Test: AI suggestions display correctly after load

## Expected Behavior

### User Experience:
1. User clicks "AI Suggest Team" button
2. Button immediately changes to "Getting Suggestions..." and becomes disabled
3. After 2-3 seconds, AI suggestions appear below
4. Button returns to "AI Suggest Team" and becomes clickable again

### Technical Behavior:
1. **ONE** API call to `/api/events/{event_id}/suggest-team`
2. **ONE** set of backend logs for the request
3. **ONE** OpenRouter AI API call
4. Clean console logs showing the flow

## Additional Notes

### Why Only Keep One Button?
- **Better UX**: Having two identical buttons is confusing
- **Context**: The "Next Actions" section is where action buttons belong
- **Consistency**: Other actions (Manual Assign, Set Budget) are in the same section
- **Simplicity**: Reduces code duplication and maintenance

### Future Improvements
Consider adding:
1. **Debounce utility**: For extra protection against rapid clicks
2. **Request cancellation**: Cancel previous request if a new one is made
3. **Cache suggestions**: Store suggestions to avoid re-fetching
4. **Auto-refresh**: Option to auto-refresh when team availability changes

## Related Files

- Backend: `/backend/routers/events.py` - The `suggest_team` endpoint
- Frontend: `/frontend/src/components/AISuggestionDisplay.js` - Displays the suggestions
- Frontend: `/frontend/src/pages/PostProdPanel.jsx` - Similar AI suggest implementation

## Prevention

To prevent this in the future:
1. **Code reviews**: Check for duplicate buttons/handlers
2. **Logging**: Add logging to track API calls
3. **Loading guards**: Always add guards for async operations
4. **UI state**: Always disable buttons during async operations
5. **Search**: Use grep/search to find duplicate button text before adding new ones
