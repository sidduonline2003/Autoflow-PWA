# Ola Maps Setup Guide

## 1. Get Your API Key
To use the Ola Maps SDK, you must have a valid API Key.

1.  **Visit the Developer Portal**: Go to [Ola Maps Developer Portal](https://maps.olamaps.io/) or [Ola Krutrim Cloud](https://cloud.olakrutrim.com/).
2.  **Sign Up / Log In**: Create an account if you don't have one.
3.  **Create a Project**: Start a new project in the dashboard.
4.  **Generate API Key**: Navigate to the **API Keys** section. You will likely see two keys:
    *   **Public Key (API Key)**: This is safe to use in your frontend application.
    *   **Private Key (Secret)**: This is for secure server-side operations.
5.  **Enable Services**: Ensure the following APIs are enabled for your key:
    *   **Maps SDK (Vector Tiles)**
    *   **Places API** (for search/geocoding)
    *   **Geocoding API**

## 2. Configure Your Project
You need to use the **Public Key** (API Key) for the frontend.

1.  Open (or create) the `.env` file in your `frontend` directory.
2.  Add the following line (replace with your actual **Public Key**):
    ```env
    REACT_APP_OLA_MAPS_API_KEY=your_public_key_here
    ```
3.  **Restart your development server** (`npm start`) for the changes to take effect.

## 3. Verify Integration
The application is configured to use the Ola Maps SDK.
-   **Script**: The SDK script has been updated in `public/index.html` to the correct version: `https://api.olamaps.io/tiles/vector/v1/js/libs/olamaps-sdk-js/v1.0.0/olamaps-sdk-js.js`.
-   **Component**: `LivePulseMap.jsx` initializes the map using `window.OlaMaps` and your API key.

## Troubleshooting
-   **503 Service Unavailable**: This usually means the SDK URL was incorrect (fixed now) or the Ola Maps service is down.
-   **Map not loading**: Check the browser console. If you see "Invalid API Key", double-check your `.env` file and ensure you restarted the server.
