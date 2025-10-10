# View Job Details Button Fix - Editor Portal

## 🐛 Problem
The "View Job Details" button in the Editors Portal (Team Dashboard → My Assignments tab) was opening a blank white page and redirecting to the home page instead of showing the post-production job details.

## 🔍 Root Causes

### Issue 1: Invalid Route Navigation
The button was trying to navigate to a non-existent route:
```javascript
navigate(`/team/post-production/job/${assignment.jobId}`);
```

This route (`/team/post-production/job/:jobId`) was never defined in the application routing.

### Issue 2: AdminRoute Protection ⚠️
The correct route `/events/:eventId/postprod` was protected by `AdminRoute`, which only allows admin users to access it. When editors (non-admin users) tried to navigate there, they were redirected to their dashboard/home page.

## 💡 Analysis
1. **JobId Format**: The `jobId` from the backend API follows the format `eventId:stream` (e.g., `kN4WSMviMFYKINKCqvQd:photo`)
2. **Actual Route**: The post-production details page exists at `/events/:eventId/postprod`
3. **Missing Logic**: The button wasn't parsing the `jobId` to extract the `eventId`
4. **Route Access Control**: The route was incorrectly restricted to admin-only access

## ✅ Solution

### Fix 1: Updated Button Navigation Logic
Modified the button's onClick handler to:
1. Parse the `jobId` to extract the `eventId` and `stream`
2. Navigate to the correct existing route: `/events/${eventId}/postprod`
3. Add error handling for invalid `jobId` formats

### Fix 2: Moved Route Outside AdminRoute Protection
Moved the `/events/:eventId/postprod` route out of the `<AdminRoute />` wrapper so that all authenticated users (including editors) can access post-production job details.

### Code Changes

#### Change 1: `frontend/src/pages/TeamDashboardPage.js` (line ~1407)

**Before**:
```javascript
<Button 
    size="small" 
    startIcon={<CameraIcon />}
    variant="outlined"
    onClick={() => {
        // Navigate to post-production board for this specific job
        navigate(`/team/post-production/job/${assignment.jobId}`);
    }}
>
    View Job Details
</Button>
```

**After**:
```javascript
<Button 
    size="small" 
    startIcon={<CameraIcon />}
    variant="outlined"
    onClick={() => {
        // Parse jobId format: "eventId:stream"
        const [eventId, stream] = assignment.jobId.split(':');
        if (eventId) {
            // Navigate to post-production panel for this event
            navigate(`/events/${eventId}/postprod`);
        } else {
            toast.error('Invalid job ID format');
        }
    }}
>
    View Job Details
</Button>
```

#### Change 2: `frontend/src/App.js`

**Before**:
```javascript
{/* Admin Routes */}
<Route element={<AdminRoute />}>
  {/* ... other admin routes ... */}
  <Route path="/events/:eventId/postprod" element={<PostProdPanel />} />
</Route>
```

**After**:
```javascript
{/* Admin Routes */}
<Route element={<AdminRoute />}>
  {/* ... other admin routes ... */}
  {/* Post-Production - Admin only routes */}
  <Route path="/postprod/ingest-tracking" element={<EventIngestTrackingPage />} />
  <Route path="/postprod" element={<PostProdHub />} />
</Route>

{/* Shared Routes - Accessible by all authenticated users (including editors) */}
<Route path="/events/:eventId/postprod" element={<PostProdPanel />} />
<Route path="/data-manager" element={<DataManagerPortal />} />
```

## 🎯 Result
- ✅ Button now correctly navigates to the post-production job details page
- ✅ No more blank white pages or home page redirects
- ✅ Editors can now view job details for their assignments
- ✅ Proper error handling for edge cases
- ✅ Route is accessible to all authenticated users while still requiring authentication

## 📝 Technical Details

### JobId Format
The backend API endpoint `/api/postprod/my-assignments` returns assignments with `jobId` in the format:
```
{eventId}:{stream}
```

Example:
```
kN4WSMviMFYKINKCqvQd:photo
kN4WSMviMFYKINKCqvQd:video
```

### Route Access Control
- **Admin-only routes**: `/postprod`, `/postprod/ingest-tracking` (PostProd Hub and tracking)
- **Shared routes** (all authenticated users): `/events/:eventId/postprod` (Job Details)
- Both still require authentication via `<ProtectedRoute />`

### Existing Routes
The application uses nested route protection:
```javascript
<Route element={<ProtectedRoute />}>  {/* Authentication required */}
  <Route element={<AdminRoute />}>    {/* Admin only */}
    {/* Admin-only routes */}
  </Route>
  {/* Shared authenticated routes */}
</Route>
```

## 🧪 Testing
To verify the fix:
1. Log in as an editor with post-production assignments
2. Navigate to Team Dashboard → "My Assignments" tab
3. Find an assignment card
4. Click "View Job Details" button
5. ✅ Should navigate to `/events/{eventId}/postprod` and show the job details
6. ✅ No blank white page
7. ✅ No redirect to home page
8. ✅ Job details panel displays correctly

## 🔗 Related Files
- `frontend/src/pages/TeamDashboardPage.js` - Fixed button navigation
- `frontend/src/App.js` - Updated route access control
- `frontend/src/components/AdminRoute.js` - Route protection logic
- `frontend/src/pages/PostProdPanel.jsx` - Target component for job details
- `backend/routers/postprod_assignments.py` - API endpoint that returns assignments

## 📅 Date Fixed
October 11, 2025
