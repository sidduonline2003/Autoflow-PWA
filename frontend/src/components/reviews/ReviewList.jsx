import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  CircularProgress,
  Typography,
  Skeleton
} from '@mui/material';
import ReviewCard from './ReviewCard';

/**
 * ReviewList Component
 * Displays a list of reviews with infinite scroll
 */
const ReviewList = ({
  reviews,
  loading,
  hasMore,
  onLoadMore,
  onReply,
  onResolve,
  onMoreOptions,
  onStatusChange,
  repliesMap = {}
}) => {
  const [localLoading, setLocalLoading] = useState(false);
  const observerTarget = useRef(null);

  // Intersection Observer for infinite scroll
  const handleObserver = useCallback((entries) => {
    const [entry] = entries;
    if (entry.isIntersecting && hasMore && !loading && !localLoading) {
      setLocalLoading(true);
      onLoadMore?.().finally(() => setLocalLoading(false));
    }
  }, [hasMore, loading, localLoading, onLoadMore]);

  useEffect(() => {
    const element = observerTarget.current;
    const option = {
      root: null,
      rootMargin: '20px',
      threshold: 0
    };

    const observer = new IntersectionObserver(handleObserver, option);
    if (element) observer.observe(element);

    return () => {
      if (element) observer.unobserve(element);
    };
  }, [handleObserver]);

  // Render skeleton loaders
  const renderSkeletons = (count = 3) => {
    return Array.from({ length: count }).map((_, index) => (
      <Box key={`skeleton-${index}`} sx={{ mb: 3 }}>
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: '12px' }} />
      </Box>
    ));
  };

  // Initial loading state
  if (loading && reviews.length === 0) {
    return (
      <Box sx={{ width: '100%' }}>
        {renderSkeletons(5)}
      </Box>
    );
  }

  // Empty state
  if (!loading && reviews.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          py: 8,
          textAlign: 'center'
        }}
      >
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No reviews found
        </Typography>
        <Typography variant="body2" color="text.secondary">
          There are no reviews matching your current filters.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      {/* Review Cards */}
      {reviews.map((review) => (
        <ReviewCard
          key={review.reviewId}
          review={review}
          onReply={onReply}
          onResolve={onResolve}
          onMoreOptions={onMoreOptions}
          onStatusChange={onStatusChange}
          replies={repliesMap[review.reviewId] || []}
        />
      ))}

      {/* Loading More Indicator */}
      {localLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={32} />
        </Box>
      )}

      {/* Intersection Observer Target */}
      {hasMore && !localLoading && (
        <Box
          ref={observerTarget}
          sx={{
            height: '50px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Loading more...
          </Typography>
        </Box>
      )}

      {/* End of List Indicator */}
      {!hasMore && reviews.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            py: 3,
            borderTop: '1px solid',
            borderColor: 'divider'
          }}
        >
          <Typography variant="body2" color="text.secondary">
            You've reached the end of the list
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ReviewList;
