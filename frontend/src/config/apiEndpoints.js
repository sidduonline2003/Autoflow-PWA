/**
 * AutoStudioFlow - Centralized API Configuration
 * 
 * This file maps all frontend API endpoints to the new microservices architecture.
 * The Gateway service (port 8000) handles routing to the appropriate microservice.
 * 
 * FRONTEND -> GATEWAY (8000) -> MICROSERVICE
 * 
 * No changes needed in individual pages/components - the Gateway handles routing!
 */

// ============================================================
// API BASE CONFIGURATION
// ============================================================

// Gateway URL - single entry point for all API calls
export const API_BASE_URL = process.env.REACT_APP_API_URL || '';

// Microservice internal URLs (used by Gateway, not frontend)
export const MICROSERVICE_URLS = {
  GATEWAY: 'http://localhost:8000',
  CORE: 'http://localhost:8001',
  EQUIPMENT: 'http://localhost:8002',
  POSTPROD: 'http://localhost:8003',
  FINANCIAL: 'http://localhost:8004',
  AI: 'http://localhost:8005',
};

// ============================================================
// ENDPOINT MAPPING - Frontend path to Microservice routing
// ============================================================

export const API_ENDPOINTS = {
  // ==================== CORE SERVICE (Port 8001) ====================
  
  // Auth endpoints
  AUTH: {
    REGISTER_ORG: '/api/auth/register-organization',
    ACCEPT_INVITE: '/api/auth/accept-invite',
    LOGIN: '/api/auth/login',
    LOGOUT: '/api/auth/logout',
    ME: '/api/auth/me',
    REFRESH: '/api/auth/refresh',
  },
  
  // Team endpoints
  TEAM: {
    LIST: '/api/team/',
    CREATE: '/api/team/',
    GET: (id) => `/api/team/${id}`,
    UPDATE: (id) => `/api/team/${id}`,
    DELETE: (id) => `/api/team/${id}`,
    INVITE: '/api/team/invite',
    ROLES: '/api/team/roles',
  },
  
  // Client endpoints
  CLIENTS: {
    LIST: '/api/clients/',
    CREATE: '/api/clients/',
    GET: (id) => `/api/clients/${id}`,
    UPDATE: (id) => `/api/clients/${id}`,
    DELETE: (id) => `/api/clients/${id}`,
    MY_EVENTS: '/api/client/my-events',
    NOTIFICATIONS: '/api/client/notifications',
    EVENT_CHAT: (eventId) => `/api/client/event/${eventId}/chat`,
    EVENT_TEAM: (eventId) => `/api/client/event/${eventId}/team`,
  },
  
  // Events endpoints
  EVENTS: {
    LIST: '/api/events/',
    CREATE: '/api/events/',
    GET: (id) => `/api/events/${id}`,
    UPDATE: (id) => `/api/events/${id}`,
    DELETE: (id) => `/api/events/${id}`,
    ASSIGNED_TO_ME: '/api/events/assigned-to-me',
    FOR_CLIENT: (clientId) => `/api/events/for-client/${clientId}`,
    TEAM_CHAT: (eventId) => `/api/events/team/event/${eventId}/chat`,
    AVAILABLE_TEAM: (eventId) => `/api/events/${eventId}/available-team`,
    ASSIGN_EDITORS: (eventId) => `/api/events/${eventId}/assign-editors`,
    TRIGGER_POST_PROD: (eventId) => `/api/events/${eventId}/trigger-post-production`,
    POST_PROD_STATUS: (eventId) => `/api/events/${eventId}/post-production/status`,
  },
  
  // Messages endpoints
  MESSAGES: {
    LIST: '/api/messages/',
    SEND: '/api/messages/',
    THREAD: (threadId) => `/api/messages/thread/${threadId}`,
  },
  
  // Attendance endpoints
  ATTENDANCE: {
    DASHBOARD_LIVE: '/api/attendance/dashboard/live',
    CHECK_IN: '/api/attendance/check-in',
    CHECK_OUT: '/api/attendance/check-out',
    EVENT_STATUS: (eventId) => `/api/attendance/event/${eventId}/status`,
  },
  
  // Leave endpoints
  LEAVE: {
    LIST: '/api/leave-requests/',
    CREATE: '/api/leave-requests/',
    MY_REQUESTS: '/api/leave-requests/my-requests',
    PENDING: '/api/leave-requests/pending',
    APPROVE: (id) => `/api/leave-requests/${id}/approve`,
    REJECT: (id) => `/api/leave-requests/${id}/reject`,
    CANCEL: (id) => `/api/leave-requests/${id}/cancel`,
    DELETE: (id) => `/api/leave-requests/${id}`,
  },
  
  // Contracts endpoints
  CONTRACTS: {
    LIST: '/api/contracts/',
    CREATE: '/api/contracts/',
    GET: (id) => `/api/contracts/${id}`,
    UPDATE: (id) => `/api/contracts/${id}`,
  },
  
  // Intake endpoints
  INTAKE: {
    SUBMIT: '/api/intake/',
    GET: (id) => `/api/intake/${id}`,
  },

  // ==================== EQUIPMENT SERVICE (Port 8002) ====================
  
  EQUIPMENT: {
    // Inventory
    LIST: '/api/equipment/',
    CREATE: '/api/equipment/',
    GET: (assetId) => `/api/equipment/${assetId}`,
    UPDATE: (assetId) => `/api/equipment/${assetId}`,
    DELETE: (assetId) => `/api/equipment/${assetId}`,
    AVAILABILITY: '/api/equipment/availability',
    
    // QR codes
    QR_CODE: (assetId) => `/api/equipment/${assetId}/qr`,
    GENERATE_QR: (assetId) => `/api/equipment/${assetId}/generate-qr`,
    BATCH_GENERATE_QR: '/api/equipment/batch-generate-qr',
    
    // Checkouts
    CHECKOUT: '/api/equipment/checkout',
    CHECKIN: '/api/equipment/checkin',
    CHECKOUTS: '/api/equipment/checkouts',
    MY_CHECKOUTS: '/api/equipment/my-checkouts',
    
    // Maintenance
    SCHEDULE_MAINTENANCE: (assetId) => `/api/equipment/${assetId}/maintenance`,
    COMPLETE_MAINTENANCE: (assetId, maintenanceId) => `/api/equipment/${assetId}/maintenance/${maintenanceId}/complete`,
    MAINTENANCE_HISTORY: (assetId) => `/api/equipment/${assetId}/maintenance`,
    
    // Analytics
    ANALYTICS_SUMMARY: '/api/equipment/analytics/summary',
    CREW_SCORES: '/api/equipment/analytics/crew-scores',
    UTILIZATION_TREND: '/api/equipment/analytics/utilization-trend',
    
    // History
    EQUIPMENT_HISTORY: (assetId) => `/api/equipment/${assetId}/history`,
    USER_HISTORY: (userId) => `/api/equipment/history/user/${userId}`,
    
    // Bulk operations
    BULK_UPLOAD_TEMPLATE: '/api/equipment/bulk-upload/template',
    BULK_UPLOAD: '/api/equipment/bulk-upload',
    BULK_DELETE: '/api/equipment/bulk-delete',
  },
  
  // Storage Media
  STORAGE_MEDIA: {
    LIST: '/api/storage-media/',
    CREATE: '/api/storage-media/',
    GET: (id) => `/api/storage-media/${id}`,
    UPDATE: (id) => `/api/storage-media/${id}`,
    ASSIGN: (id) => `/api/storage-media/${id}/assign`,
  },
  
  // Data Submissions (Storage)
  DATA_SUBMISSIONS: {
    BATCHES: '/api/data-submissions/batches',
    DM_DASHBOARD: '/api/data-submissions/dm/dashboard',
    DM_PENDING_APPROVALS: '/api/data-submissions/dm/pending-approvals',
    DM_STORAGE_MEDIA: '/api/data-submissions/dm/storage-media',
    DM_APPROVE_BATCH: '/api/data-submissions/dm/approve-batch',
  },

  // ==================== POSTPROD SERVICE (Port 8003) ====================
  
  POSTPROD: {
    // Job management
    INIT: (eventId) => `/api/events/${eventId}/postprod/init`,
    OVERVIEW: (eventId) => `/api/events/${eventId}/postprod/overview`,
    STATUS: (jobId) => `/api/postprod/${jobId}/status`,
    MY_ASSIGNMENTS: '/api/postprod/my-assignments',
    
    // Stream operations
    ASSIGN: (eventId, stream) => `/api/events/${eventId}/postprod/${stream}/assign`,
    START: (eventId, stream) => `/api/events/${eventId}/postprod/${stream}/start`,
    SUBMIT: (eventId, stream) => `/api/events/${eventId}/postprod/${stream}/submit`,
    REVIEW: (eventId, stream) => `/api/events/${eventId}/postprod/${stream}/review`,
    REASSIGN: (eventId, stream) => `/api/events/${eventId}/postprod/${stream}/reassign`,
    WAIVE: (eventId, stream) => `/api/events/${eventId}/postprod/${stream}/waive`,
    
    // Due dates
    EXTEND_DUE: (eventId) => `/api/events/${eventId}/postprod/due`,
    
    // Activity
    ACTIVITY: (eventId) => `/api/events/${eventId}/postprod/activity`,
    ADD_NOTE: (eventId) => `/api/events/${eventId}/postprod/activity/note`,
  },
  
  // Availability
  AVAILABILITY: {
    LIST: '/api/availability/',
    UPDATE: '/api/availability/',
    MY_AVAILABILITY: '/api/availability/me',
  },

  // ==================== FINANCIAL SERVICE (Port 8004) ====================
  
  FINANCIAL: {
    // Hub/Dashboard
    HUB: '/api/financial-hub/',
    MEMBER_SUMMARY: (memberId) => `/api/financial/member/${memberId}/summary`,
    
    // Accounts Receivable
    AR: {
      LIST: '/api/ar/',
      GET: (id) => `/api/ar/${id}`,
      CREATE: '/api/ar/',
      UPDATE: (id) => `/api/ar/${id}`,
    },
    
    // Accounts Payable
    AP: {
      LIST: '/api/ap/',
      GET: (id) => `/api/ap/${id}`,
      CREATE: '/api/ap/',
      UPDATE: (id) => `/api/ap/${id}`,
      VENDORS: '/api/ap/vendors/',
      SUBSCRIPTIONS: '/api/ap/subscriptions/',
      BILLS: '/api/ap/bills/',
    },
    
    // Invoices
    INVOICES: {
      LIST: '/api/financial-hub/invoices/',
      CREATE: '/api/financial-hub/invoices/',
      GET: (id) => `/api/financial-hub/invoices/${id}`,
      UPDATE: (id) => `/api/financial-hub/invoices/${id}`,
      PDF: (id) => `/api/financial-hub/invoices/${id}/pdf`,
    },
    
    // Quotes
    QUOTES: {
      LIST: '/api/ar/quotes/',
      CREATE: '/api/ar/quotes/',
      GET: (id) => `/api/ar/quotes/${id}`,
      PDF: (id) => `/api/ar/quotes/${id}/pdf`,
    },
    
    // Receipts
    RECEIPTS: {
      LIST: '/api/receipts/',
      UPLOAD: '/api/receipts/upload',
      EVENT: (eventId) => `/api/receipts/event/${eventId}`,
      VERIFY: (id) => `/api/receipts/${id}/verify`,
      DASHBOARD_SUMMARY: '/api/receipts/dashboard/summary',
      ADMIN_ANALYSIS: (id) => `/api/receipts/${id}/admin/analysis`,
      ADMIN_AI_QUEUE: '/api/receipts/admin/ai-queue',
      ADMIN_AI_ANALYSIS: (id) => `/api/receipts/admin/ai-analysis/${id}`,
      ADMIN_AI_INSIGHTS: '/api/receipts/admin/ai-insights',
      ADMIN_AI_DECISION: (id) => `/api/receipts/admin/ai-assisted-decision/${id}`,
    },
    
    // Budgets
    BUDGETS: {
      LIST: '/api/budgets/',
      CREATE: '/api/budgets/',
      GET: (id) => `/api/budgets/${id}`,
      UPDATE: (id) => `/api/budgets/${id}`,
    },
    
    // Salaries
    SALARIES: {
      PROFILES: '/api/salaries/profiles',
      RUNS: '/api/salaries/runs/',
      RUN: (runId) => `/api/salaries/runs/${runId}`,
      RUN_PAYSLIPS: (runId) => `/api/salaries/runs/${runId}/payslips`,
      RUN_EXPORT: (runId) => `/api/salaries/runs/${runId}/export`,
      RUN_MARK_PAID: (runId) => `/api/salaries/runs/${runId}/mark-all-paid`,
      PAYSLIP: (payslipId) => `/api/salaries/payslips/${payslipId}`,
      PAYSLIP_PAYMENT: (payslipId) => `/api/salaries/payslips/${payslipId}/payment`,
      PAYSLIP_VOID: (payslipId) => `/api/salaries/payslips/${payslipId}/void`,
      MY_PAYSLIPS: '/api/salaries/my-payslips',
    },
    
    // Period Close
    PERIOD_CLOSE: {
      LIST: '/api/period-close/',
      CLOSE: '/api/period-close/close',
    },
    
    // Adjustments
    ADJUSTMENTS: {
      LIST: '/api/adjustments/',
      CREATE: '/api/adjustments/',
    },
  },

  // ==================== AI SERVICE (Port 8005) ====================
  
  AI: {
    // OCR
    OCR: {
      PROCESS_DOCUMENT: '/api/ai/ocr/process-document',
      BATCH_PROCESS: '/api/ai/ocr/batch-process',
      PROCESS_RECEIPT: '/api/ai/ocr/process-receipt',
    },
    
    // Analysis
    ANALYSIS: {
      FINANCIAL: '/api/ai/analysis/financial',
      TEAM_PERFORMANCE: '/api/ai/analysis/team-performance',
      EVENT_PROFITABILITY: '/api/ai/analysis/event-profitability',
      CLIENT_HEALTH: '/api/ai/analysis/client-health',
    },
    
    // Insights
    INSIGHTS: {
      DASHBOARD: '/api/ai/insights/dashboard',
      TRENDS: '/api/ai/insights/trends',
      PREDICT: '/api/ai/insights/predict',
      ANOMALIES: '/api/ai/insights/anomalies',
      RECOMMENDATIONS: '/api/ai/insights/recommendations',
    },
    
    // Suggestions
    SUGGESTIONS: {
      EVENT_SETUP: '/api/ai/suggestions/event-setup',
      TEAM_ASSIGNMENT: '/api/ai/suggestions/team-assignment',
      PRICING: '/api/ai/suggestions/pricing',
      EQUIPMENT: '/api/ai/suggestions/equipment',
      FOLLOW_UPS: '/api/ai/suggestions/follow-ups',
    },
  },
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Build full API URL
 * @param {string} endpoint - The API endpoint path
 * @returns {string} Full URL
 */
export function buildApiUrl(endpoint) {
  return `${API_BASE_URL}${endpoint}`;
}

/**
 * Get service name from endpoint path
 * @param {string} path - The API path
 * @returns {string} Service name (core, equipment, postprod, financial, ai)
 */
export function getServiceFromPath(path) {
  if (path.startsWith('/api/equipment') || path.startsWith('/api/storage-media') || path.startsWith('/api/data-submissions')) {
    return 'equipment';
  }
  if (path.includes('/postprod') || path.startsWith('/api/availability')) {
    return 'postprod';
  }
  if (path.startsWith('/api/financial') || path.startsWith('/api/ar') || path.startsWith('/api/ap') || 
      path.startsWith('/api/receipts') || path.startsWith('/api/budgets') || path.startsWith('/api/salaries') ||
      path.startsWith('/api/period-close') || path.startsWith('/api/adjustments')) {
    return 'financial';
  }
  if (path.startsWith('/api/ai')) {
    return 'ai';
  }
  return 'core'; // Default: auth, team, clients, events, messages, attendance, leave, contracts, intake
}

export default API_ENDPOINTS;
