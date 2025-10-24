import React from 'react';
import { Box, Typography, IconButton, ImageList, ImageListItem } from '@mui/material';
import {
  InsertDriveFile as DocumentIcon,
  PlayCircle as VideoIcon,
  Image as ImageIcon,
  Download as DownloadIcon
} from '@mui/icons-material';

/**
 * AttachmentPreview Component
 * Displays preview of attachments (images, videos, documents)
 */
const AttachmentPreview = ({ attachments }) => {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  const getIconForType = (type) => {
    switch (type) {
      case 'image':
        return <ImageIcon />;
      case 'video':
        return <VideoIcon />;
      case 'document':
        return <DocumentIcon />;
      default:
        return <DocumentIcon />;
    }
  };

  const handleDownload = (url, fileName) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'download';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const imageAttachments = attachments.filter(att => att.type === 'image');
  const otherAttachments = attachments.filter(att => att.type !== 'image');

  return (
    <Box sx={{ mt: 2 }}>
      {/* Image Attachments Grid */}
      {imageAttachments.length > 0 && (
        <ImageList 
          sx={{ 
            width: '100%', 
            maxHeight: 200,
            mb: 2
          }} 
          cols={Math.min(imageAttachments.length, 3)} 
          rowHeight={120}
        >
          {imageAttachments.map((item, index) => (
            <ImageListItem key={index}>
              <img
                src={item.url}
                alt={item.fileName || `Attachment ${index + 1}`}
                loading="lazy"
                style={{
                  objectFit: 'cover',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
                onClick={() => window.open(item.url, '_blank')}
              />
            </ImageListItem>
          ))}
        </ImageList>
      )}

      {/* Other Attachments List */}
      {otherAttachments.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {otherAttachments.map((item, index) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '8px',
                backgroundColor: 'background.paper',
                '&:hover': {
                  backgroundColor: 'action.hover'
                }
              }}
            >
              <Box sx={{ color: 'text.secondary' }}>
                {getIconForType(item.type)}
              </Box>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="body2" noWrap>
                  {item.fileName || 'Attachment'}
                </Typography>
                {item.size && (
                  <Typography variant="caption" color="text.secondary">
                    {(item.size / 1024).toFixed(2)} KB
                  </Typography>
                )}
              </Box>
              <IconButton
                size="small"
                onClick={() => handleDownload(item.url, item.fileName)}
                aria-label="Download attachment"
              >
                <DownloadIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default AttachmentPreview;
