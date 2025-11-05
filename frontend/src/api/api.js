import axios from 'axios';
import { auth } from '../firebase';

const api = axios.create({
  baseURL: '/api', // Adjust this if your API base URL is different
});

api.interceptors.request.use(async (config) => {
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const token = await currentUser.getIdToken();
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    } catch (error) {
      console.warn('[api] Failed to attach auth token', error);
    }
  }
  return config;
});

export default api;
