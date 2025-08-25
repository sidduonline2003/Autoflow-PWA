// frontend/src/api.js
import axios from "axios";
import { getAuth } from "firebase/auth";

/**
 * Shared Axios instance for all API calls.
 * - Base URL: proxied to backend at /api
 * - Automatically attaches Firebase ID token (cached, no forced refresh)
 * - Single safe retry on 401 with a forced refresh
 */
const api = axios.create({
  baseURL: "/api",
  // If your backend sets CORS+cookies, flip this to true.
  withCredentials: false,
  headers: {
    "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest",
  },
});

// Attach (cached) ID token to every request.
api.interceptors.request.use(async (config) => {
  const auth = getAuth();
  const user = auth.currentUser;

  if (user) {
    // Use cached token; Firebase will refresh it when needed.
    const token = await user.getIdToken();
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    // Make sure we don't send a stale header if user logged out.
    if (config.headers?.Authorization) {
      delete config.headers.Authorization;
    }
  }
  return config;
});

// One-time retry on 401: force refresh the token and replay the request.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error || {};
    if (!response) return Promise.reject(error);

    if (response.status === 401 && !config.__retried) {
      const auth = getAuth();
      const user = auth.currentUser;
      if (user) {
        try {
          const fresh = await user.getIdToken(true); // force refresh ONCE
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${fresh}`;
          config.__retried = true;
          return api.request(config);
        } catch (e) {
          // fall through to reject
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;