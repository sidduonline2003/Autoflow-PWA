# Live Attendance Dashboard Fix

## Issue
The Live Attendance Dashboard was reported to be "always loading". After the initial fix, it reported "You are not associated with any organization" even for logged-in admins.

## Diagnosis
1.  **Infinite Loading**: The `useEffect` hook responsible for fetching data was returning early if `user.claims.orgId` was missing, but it was NOT setting `loading` to `false`.
2.  **Incorrect Claims Access**: The code was attempting to access `user.claims.orgId`. However, the `user` object from Firebase Auth does not directly contain `claims`. The `claims` are provided separately by the `AuthContext` via the `useAuth` hook.
3.  **Fetch Timeout**: There was no timeout on the API fetch call.

## Fixes Applied
1.  **Corrected Claims Access**: Replaced all instances of `user.claims.orgId` with `claims.orgId`. The `claims` object is destructured from `useAuth()`.
2.  **Updated `useEffect` Dependency**: Added `claims` and `authLoading` to the dependency array.
3.  **Graceful Handling of Missing User/OrgId**: Added checks for `user` and `claims.orgId`. If missing, `loading` is set to `false` immediately.
4.  **Fetch Timeout**: Added a 15-second timeout to the `fetch` call using `AbortController`.
5.  **Improved Error Handling**: Added specific error messages for missing user or organization association in the render method.

## Verification
The code now correctly handles authentication states:
-   **Loading Auth**: Shows loading spinner.
-   **Not Logged In**: Shows "Please log in" warning.
-   **No Organization**: Shows "You are not associated with any organization" warning (correctly checking `claims.orgId`).
-   **Success**: Shows the dashboard data.
