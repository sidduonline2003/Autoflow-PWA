import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Menu,
  IconButton,
  Fab,
  Chip
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as CheckIcon,
  Assignment as AssignmentIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { toast } from 'react-hot-toast';
import ReviewList from '../components/reviews/ReviewList';
import ReviewFilters from '../components/reviews/ReviewFilters';
import ReviewAnalyticsDashboard from '../components/reviews/ReviewAnalyticsDashboard';
import axios from 'axios';

const PostProductionReviewsPage = () => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [selectedReviews, setSelectedReviews] = useState([]);
  const [repliesMap, setRepliesMap] = useState({});

  // Filters
  const [filters, setFilters] = useState({
    status: null,
    priority: null,
    reviewerRole: null,
    eventId: null,
    assignedTo: null,
    searchText: null
  });

  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [bulkAssignDialogOpen, setBulkAssignDialogOpen] = useState(false);
  const [selectedReviewId, setSelectedReviewId] = useState(null);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState(null);
  const [currentReviewForMenu, setCurrentReviewForMenu] = useState(null);

  // Form states
  const [newReview, setNewReview] = useState({
    eventId: '',
    eventName: '',
    reviewType: 'comment',
    priority: 'medium',
    content: '',
    assignedTo: ''
  });

  const [replyContent, setReplyContent] = useState('');
  const [bulkAssignTo, setBulkAssignTo] = useState('');

  const LIMIT = 20;

  // Fetch reviews
  const fetchReviews = useCallback(async (reset = false) => {
    try {
      setLoading(true);
      const currentOffset = reset ? 0 : offset;

      // Build query params
      const params = new URLSearchParams({
        limit: LIMIT,
        offset: currentOffset,
        sortBy: 'timestamp',
        sortOrder: 'desc'
      });

      if (filters.status?.length > 0) {
        params.append('status', filters.status.join(','));
      }
      if (filters.priority?.length > 0) {
        params.append('priority', filters.priority.join(','));
      }
      if (filters.eventId) {
        params.append('eventId', filters.eventId);
      }
      if (filters.assignedTo) {
        params.append('assignedTo', filters.assignedTo);
      }
      if (filters.searchText) {
        params.append('searchText', filters.searchText);
      }

      const response = await axios.get(`/api/reviews?${params.toString()}`);

      if (response.data.success) {
        const newReviews = response.data.reviews;
        
        if (reset) {
          setReviews(newReviews);
          setOffset(LIMIT);
        } else {
          setReviews(prev => [...prev, ...newReviews]);
          setOffset(prev => prev + LIMIT);
        }

        setHasMore(response.data.pagination.hasMore);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
      toast.error('Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, [offset, filters]);

  // Fetch analytics
  const fetchAnalytics = async () => {
    try {
      setAnalyticsLoading(true);
      const response = await axios.get('/api/reviews/analytics/summary');
      
      if (response.data.success) {
        setAnalytics(response.data.analytics);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Fetch replies for a review
  const fetchReplies = async (reviewId) => {
    try {
      const response = await axios.get(`/api/reviews/${reviewId}/replies`);
      
      if (response.data.success) {
        setRepliesMap(prev => ({
          ...prev,
          [reviewId]: response.data.replies
        }));
      }
    } catch (error) {
      console.error('Error fetching replies:', error);
    }
  };

  // Initial load
  useEffect(() => {
    fetchReviews(true);
    fetchAnalytics();
  }, [filters]);

  // Handlers
  const handleCreateReview = async () => {
    try {
      const response = await axios.post('/api/reviews/', {
        eventId: newReview.eventId,
        eventName: newReview.eventName,
        reviewerRole: 'admin', // This should come from user context
        reviewType: newReview.reviewType,
        priority: newReview.priority,
        content: newReview.content,
        assignedTo: newReview.assignedTo || null
      });

      if (response.data.success) {
        toast.success('Review created successfully', {
          icon: '✅',
          duration: 3000
        });
        setCreateDialogOpen(false);
        setNewReview({
          eventId: '',
          eventName: '',
          reviewType: 'comment',
          priority: 'medium',
          content: '',
          assignedTo: ''
        });
        fetchReviews(true);
        fetchAnalytics();
      }
    } catch (error) {
      console.error('Error creating review:', error);
      toast.error('Failed to create review');
    }
  };

  const handleResolve = async (reviewId) => {
    try {
      const response = await axios.patch(`/api/reviews/${reviewId}`, {
        status: 'resolved'
      });

      if (response.data.success) {
        toast.success('Review marked as resolved', {
          icon: <CheckIcon />,
          duration: 3000
        });
        
        // Optimistic update
        setReviews(prev =>
          prev.map(r =>
            r.reviewId === reviewId
              ? { ...r, status: 'resolved', updatedAt: new Date().toISOString() }
              : r
          )
        );
        fetchAnalytics();
      }
    } catch (error) {
      console.error('Error resolving review:', error);
      toast.error('Failed to resolve review');
    }
  };

  const handleReply = (reviewId) => {
    setSelectedReviewId(reviewId);
    setReplyDialogOpen(true);
    fetchReplies(reviewId);
  };

  const handleSendReply = async () => {
    if (!replyContent.trim()) {
      toast.error('Please enter a reply');
      return;
    }

    try {
      const response = await axios.post(`/api/reviews/${selectedReviewId}/replies`, {
        content: replyContent
      });

      if (response.data.success) {
        toast.success('Reply added successfully');
        setReplyContent('');
        setReplyDialogOpen(false);
        
        // Update thread count
        setReviews(prev =>
          prev.map(r =>
            r.reviewId === selectedReviewId
              ? { ...r, threadCount: (r.threadCount || 0) + 1 }
              : r
          )
        );
        
        // Refresh replies
        fetchReplies(selectedReviewId);
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      toast.error('Failed to send reply');
    }
  };

  const handleMoreOptions = (reviewId, event) => {
    setCurrentReviewForMenu(reviewId);
    setMoreMenuAnchor(event.currentTarget);
  };

  const handleCloseMoreMenu = () => {
    setMoreMenuAnchor(null);
    setCurrentReviewForMenu(null);
  };

  const handleDeleteReview = async () => {
    if (!currentReviewForMenu) return;

    try {
      const response = await axios.delete(`/api/reviews/${currentReviewForMenu}`);

      if (response.data.success) {
        toast.success('Review deleted successfully');
        setReviews(prev => prev.filter(r => r.reviewId !== currentReviewForMenu));
        fetchAnalytics();
      }
    } catch (error) {
      console.error('Error deleting review:', error);
      toast.error('Failed to delete review');
    } finally {
      handleCloseMoreMenu();
    }
  };

  const handleBulkResolve = async () => {
    try {
      const response = await axios.post('/api/reviews/bulk-update', {
        reviewIds: selectedReviews,
        status: 'resolved'
      });

      if (response.data.success) {
        toast.success(`Resolved ${response.data.updatedCount} reviews`);
        setSelectedReviews([]);
        fetchReviews(true);
        fetchAnalytics();
      }
    } catch (error) {
      console.error('Error bulk resolving:', error);
      toast.error('Failed to resolve reviews');
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkAssignTo) {
      toast.error('Please select a user');
      return;
    }

    try {
      const response = await axios.post('/api/reviews/bulk-update', {
        reviewIds: selectedReviews,
        assignedTo: bulkAssignTo
      });

      if (response.data.success) {
        toast.success(`Assigned ${response.data.updatedCount} reviews`);
        setBulkAssignDialogOpen(false);
        setBulkAssignTo('');
        setSelectedReviews([]);
        fetchReviews(true);
      }
    } catch (error) {
      console.error('Error bulk assigning:', error);
      toast.error('Failed to assign reviews');
    }
  };

  const clearSelection = () => {
    setSelectedReviews([]);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight={700}>
          Post-Production Reviews
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          New Review
        </Button>
      </Box>

      {/* Analytics Dashboard */}
      <ReviewAnalyticsDashboard analytics={analytics} loading={analyticsLoading} />

      {/* Bulk Operations Bar */}
      {selectedReviews.length > 0 && (
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={3}
          p={2}
          bgcolor="primary.light"
          borderRadius={2}
        >
          <Chip
            label={`${selectedReviews.length} selected`}
            onDelete={clearSelection}
          />
          <Box display="flex" gap={1}>
            <Button
              variant="outlined"
              startIcon={<CheckIcon />}
              onClick={handleBulkResolve}
              sx={{ bgcolor: 'white' }}
            >
              Resolve Selected
            </Button>
            <Button
              variant="outlined"
              startIcon={<AssignmentIcon />}
              onClick={() => setBulkAssignDialogOpen(true)}
              sx={{ bgcolor: 'white' }}
            >
              Assign To...
            </Button>
          </Box>
        </Box>
      )}

      {/* Filters */}
      <ReviewFilters
        filters={filters}
        onFilterChange={setFilters}
        onSearch={(text) => setFilters(prev => ({ ...prev, searchText: text }))}
      />

      {/* Reviews List */}
      <ReviewList
        reviews={reviews}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={() => fetchReviews(false)}
        onReply={handleReply}
        onResolve={handleResolve}
        onMoreOptions={handleMoreOptions}
        repliesMap={repliesMap}
      />

      {/* Create Review Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Review</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              label="Event ID"
              value={newReview.eventId}
              onChange={(e) => setNewReview({ ...newReview, eventId: e.target.value })}
              fullWidth
            />
            <TextField
              label="Event Name"
              value={newReview.eventName}
              onChange={(e) => setNewReview({ ...newReview, eventName: e.target.value })}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Review Type</InputLabel>
              <Select
                value={newReview.reviewType}
                onChange={(e) => setNewReview({ ...newReview, reviewType: e.target.value })}
                label="Review Type"
              >
                <MenuItem value="approval">Approval</MenuItem>
                <MenuItem value="revision_request">Revision Request</MenuItem>
                <MenuItem value="comment">Comment</MenuItem>
                <MenuItem value="rejection">Rejection</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Priority</InputLabel>
              <Select
                value={newReview.priority}
                onChange={(e) => setNewReview({ ...newReview, priority: e.target.value })}
                label="Priority"
              >
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="urgent">Urgent</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Content"
              value={newReview.content}
              onChange={(e) => setNewReview({ ...newReview, content: e.target.value })}
              multiline
              rows={4}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateReview} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reply Dialog */}
      <Dialog open={replyDialogOpen} onClose={() => setReplyDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reply to Review</DialogTitle>
        <DialogContent>
          <TextField
            label="Your Reply"
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            multiline
            rows={4}
            fullWidth
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReplyDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSendReply} variant="contained">
            Send Reply
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Assign Dialog */}
      <Dialog open={bulkAssignDialogOpen} onClose={() => setBulkAssignDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Assign Reviews</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Assign To</InputLabel>
            <Select
              value={bulkAssignTo}
              onChange={(e) => setBulkAssignTo(e.target.value)}
              label="Assign To"
            >
              <MenuItem value="">Select User</MenuItem>
              {/* Add user options here */}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkAssignDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleBulkAssign} variant="contained">
            Assign
          </Button>
        </DialogActions>
      </Dialog>

      {/* More Options Menu */}
      <Menu
        anchorEl={moreMenuAnchor}
        open={Boolean(moreMenuAnchor)}
        onClose={handleCloseMoreMenu}
      >
        <MenuItem onClick={handleDeleteReview}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete Review
        </MenuItem>
      </Menu>

      {/* Floating Action Button (Mobile) */}
      <Fab
        color="primary"
        aria-label="add review"
        sx={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          display: { xs: 'flex', sm: 'none' }
        }}
        onClick={() => setCreateDialogOpen(true)}
      >
        <AddIcon />
      </Fab>
    </Container>
  );
};

export default PostProductionReviewsPage;
