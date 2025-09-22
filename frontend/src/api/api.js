import axios from 'axios';

const api = axios.create({
  baseURL: '/api', // Adjust this if your API base URL is different
});

// You can add interceptors for handling auth tokens, errors, etc. here
// For example:
// api.interceptors.request.use(config => {
//   const token = localStorage.getItem('token');
//   if (token) {
//     config.headers.Authorization = `Bearer ${token}`;
//   }
//   return config;
// });

export default api;
