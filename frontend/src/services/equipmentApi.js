import axios from 'axios';

// Create axios instance with base URL
const api = axios.create({
    baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000',
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add request interceptor to include auth token
api.interceptors.request.use(
    async (config) => {
        const { auth } = await import('../firebase');
        const user = auth.currentUser;
        if (user) {
            const token = await user.getIdToken();
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Equipment API endpoints
export const equipmentAPI = {
    // Get all equipment with optional filters
    getAll: (params) => api.get('/api/equipment/', { params }),

    // Get single equipment by ID
    getById: (assetId) => api.get(`/api/equipment/${assetId}`),

    // Create new equipment
    create: (data) => api.post('/api/equipment/', data),

    // Update equipment
    update: (assetId, data) => api.patch(`/api/equipment/${assetId}`, data),

    // Retire equipment
    retire: (assetId, data) => api.delete(`/api/equipment/${assetId}`, { data }),

    // Checkout equipment
    checkout: (data) => api.post('/api/equipment/checkout', data),

    // Checkin equipment
    checkin: (data) => api.post('/api/equipment/checkin', data),

    // Get equipment checkouts (for a user)
    getCheckouts: (params) => api.get('/api/equipment/checkouts', { params }),
    
    // Get my active checkouts (teammate view)
    getMyCheckouts: () => api.get('/api/equipment/my-checkouts'),

    // Get QR code image
    getQRCode: (assetId) => api.get(`/api/equipment/${assetId}/qr`, { responseType: 'blob' }),

    // Check availability
    checkAvailability: (params) => api.get('/api/equipment/availability', { params }),

    // Maintenance endpoints
    scheduleMaintenance: (assetId, data) => api.post(`/api/equipment/${assetId}/maintenance`, data),
    
    completeMaintenance: (assetId, maintenanceId, data) => 
        api.post(`/api/equipment/${assetId}/maintenance/${maintenanceId}/complete`, data),
    
    getMaintenanceHistory: (assetId) => api.get(`/api/equipment/${assetId}/maintenance`),

    // Analytics endpoints
    getAnalyticsSummary: (params) => api.get('/api/equipment/analytics/summary', { params }),
    
    getCrewScores: (params) => api.get('/api/equipment/analytics/crew-scores', { params }),
    
    getUtilizationTrend: (params) => api.get('/api/equipment/analytics/utilization-trend', { params }),
};

export default api;
