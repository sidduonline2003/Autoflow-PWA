import axios from 'axios';
import { getAuth } from 'firebase/auth';

const api = axios.create({
  baseURL: '/api', // goes through proxy to :8000
  timeout: 30000, // 30 second timeout
});

// Request interceptor to attach Firebase ID token
api.interceptors.request.use(async (config) => {
  const user = getAuth().currentUser;
  if (user) {
    try {
      const token = await user.getIdToken(); // Use cached token
      config.headers.Authorization = `Bearer ${token}`;
      console.log('[API] Request with auth token:', config.method?.toUpperCase(), config.url);
    } catch (error) {
      console.error('[API] Failed to get ID token:', error);
    }
  } else {
    console.log('[API] Request without auth (no user):', config.method?.toUpperCase(), config.url);
  }
  return config;
}, (error) => {
  console.error('[API] Request interceptor error:', error);
  return Promise.reject(error);
});

// Response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    if (response?.status === 401 && !config.__retried) {
      const user = getAuth().currentUser;
      if (user) {
        try {
          const fresh = await user.getIdToken(true);
          config.headers.Authorization = `Bearer ${fresh}`;
          config.__retried = true;
          return api.request(config);
        } catch {}
      }
    }
    return Promise.reject(error);
  }
);

export default api;
    const method = error.config?.method?.toUpperCase();
    const url = error.config?.url;
    const status = error.response?.status;
    const message = error.response?.data?.detail || error.message;
    
    console.error(`[API] Error: ${method} ${url} -> ${status} ${message}`);
    
    // If it's a 401, provide a more helpful error message
    if (status === 401) {
      console.error('[API] Authentication failed. User may need to sign in again.');
    }
    
    return Promise.reject(error);
  }
);

export default api;
