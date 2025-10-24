// Review Status Color Coding
export const reviewStatusColors = {
  pending: { 
    bg: '#FFF9E6', 
    border: '#FFD700', 
    icon: '#F59E0B',
    label: 'Pending'
  },
  in_progress: { 
    bg: '#E6F7FF', 
    border: '#1890FF', 
    icon: '#1890FF',
    label: 'In Progress'
  },
  resolved: { 
    bg: '#E8F5E9', 
    border: '#4CAF50', 
    icon: '#4CAF50',
    label: 'Resolved'
  },
  escalated: { 
    bg: '#FFEBEE', 
    border: '#F44336', 
    icon: '#F44336',
    label: 'Escalated'
  }
};

// Priority Indicators
export const priorityIndicators = {
  low: { 
    color: '#9E9E9E', 
    width: '3px',
    label: 'Low',
    pulse: false
  },
  medium: { 
    color: '#FF9800', 
    width: '4px',
    label: 'Medium',
    pulse: false
  },
  high: { 
    color: '#FF5722', 
    width: '5px',
    label: 'High',
    pulse: false
  },
  urgent: { 
    color: '#D32F2F', 
    width: '6px',
    label: 'Urgent',
    pulse: true
  }
};

// Review Types
export const reviewTypes = {
  approval: {
    label: 'Approval',
    icon: 'CheckCircle',
    color: '#4CAF50'
  },
  revision_request: {
    label: 'Revision Request',
    icon: 'Edit',
    color: '#FF9800'
  },
  comment: {
    label: 'Comment',
    icon: 'Comment',
    color: '#2196F3'
  },
  rejection: {
    label: 'Rejection',
    icon: 'Cancel',
    color: '#F44336'
  }
};

// Reviewer Roles
export const reviewerRoles = {
  admin: {
    label: 'Admin',
    color: '#9C27B0'
  },
  editor: {
    label: 'Editor',
    color: '#2196F3'
  },
  client: {
    label: 'Client',
    color: '#FF9800'
  }
};

// Card Styles
export const cardStyles = {
  padding: '16px',
  gap: '24px',
  borderRadius: '12px',
  elevation: {
    default: 2,
    hover: 6
  }
};

// Animation Keyframes
export const pulseAnimation = {
  '@keyframes pulse': {
    '0%': {
      opacity: 1,
    },
    '50%': {
      opacity: 0.5,
    },
    '100%': {
      opacity: 1,
    },
  }
};

// Responsive Breakpoints
export const breakpoints = {
  mobile: 'sm',
  tablet: 'md',
  desktop: 'lg'
};
