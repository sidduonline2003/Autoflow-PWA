import axios from 'axios';
import { getAuth } from 'firebase/auth';

// Create axios instance - empty baseURL since proxy already handles /api prefix
const api = axios.create({
    baseURL: '',  // Empty - requests already have /api from the routes
    withCredentials: false,
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    },
});

// Add request interceptor to include auth token
api.interceptors.request.use(
    async (config) => {
        const auth = getAuth();
        const user = auth.currentUser;
        if (user) {
            const token = await user.getIdToken();
            config.headers = config.headers || {};
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

    // History endpoints
    getEquipmentHistory: (assetId, params) => api.get(`/api/equipment/${assetId}/history`, { params }),
    
    getUserHistory: (userId, params) => api.get(`/api/equipment/history/user/${userId}`, { params }),

    // Bulk upload endpoints
    downloadBulkUploadTemplate: () => api.get('/api/equipment/bulk-upload/template', { responseType: 'blob' }),
    
    bulkUploadEquipment: (formData) => api.post('/api/equipment/bulk-upload', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
        timeout: 300000, // 5 minutes timeout for bulk uploads
    }),

    // Delete endpoints
    deleteEquipment: (assetId) => api.delete(`/api/equipment/${assetId}`),
    
    bulkDeleteEquipment: (assetIds) => api.post('/api/equipment/bulk-delete', assetIds, {
        headers: {
            'Content-Type': 'application/json',
        },
    }),

    // QR code generation endpoints
    generateQRCode: (assetId) => api.post(`/api/equipment/${assetId}/generate-qr`),
    
    batchGenerateQRCodes: (assetIds) => api.post('/api/equipment/batch-generate-qr', assetIds),
};

export default api;
