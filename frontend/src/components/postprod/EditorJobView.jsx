import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Card,
  CardContent,
  Chip,
  Stack,
  Avatar,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Divider,
  Grid,
  LinearProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Breadcrumbs,
  Link
} from '@mui/material';
import {
  AccessTime,
  CheckCircle,
  RadioButtonUnchecked,
  VideoLibrary,
  PhotoLibrary,
  Storage,
  Event,
  Person,
  Group,
  Timeline as TimelineIcon,
  Assignment,
  CloudUpload,
  RateReview,
  ExpandMore,
  Folder,
  Info,
  TrendingUp,
  NavigateNext
} from '@mui/icons-material';
import { format, formatDistanceToNow } from 'date-fns';

const EditorJobView = ({ jobData, eventId, activityData, userRole }) => {
  // Extract stream data based on user's assignment
  const photoStream = jobData?.photo || {};
  const videoStream = jobData?.video || {};
  
  // Get assigned streams for current user
  const myStreams = [];
  if (photoStream.editors?.some(e => e.uid === jobData.currentUserUid)) {
    myStreams.push({ type: 'photo', ...photoStream });
  }
  if (videoStream.editors?.some(e => e.uid === jobData.currentUserUid)) {
    myStreams.push({ type: 'video', ...videoStream });
  }

  // Get intake summary data
  const intakeSummary = jobData?.intakeSummary || {};
  const approvedSubmissions = intakeSummary?.approvedSubmissions || [];
  
  // Calculate progress
  const getStreamProgress = (stream) => {
    const state = stream?.state || '';
    if (state.includes('DONE') || state.includes('READY')) return 100;
    if (state.includes('REVIEW')) return 75;
    if (state.includes('IN_PROGRESS')) return 50;
    if (state.includes('ASSIGNED')) return 25;
    return 0;
  };

  // Format activity timeline
  const formatActivityLog = (activities) => {
    // Handle various input formats
    if (!activities) {
        return [];
    }

    // Convert to array if it's an object
    let activitiesArray = [];
    if (Array.isArray(activities)) {
        activitiesArray = activities;
    } else if (typeof activities === 'object') {
        // If it's an object with items property
        activitiesArray = activities.items || Object.values(activities);
    }

    if (activitiesArray.length === 0) {
        return [];
    }

    // Sort by timestamp (newest first)
    const sorted = [...activitiesArray].sort((a, b) => {
        const timeA = a.at?.seconds || a.at?._seconds || 0;
        const timeB = b.at?.seconds || b.at?._seconds || 0;
        return timeB - timeA; // Newest first
    });

    return sorted;
  };

  const getActivityIcon = (kind) => {
    const iconMap = {
      'INIT': <Event />,
      'ASSIGN': <Assignment />,
      'REASSIGN': <Assignment />,
      'SUBMIT': <CloudUpload />,
      'REVIEW': <RateReview />,
      'NOTE': <Info />,
      'START': <TrendingUp />
    };
    return iconMap[kind] || <TimelineIcon />;
  };

  const getActivityColor = (kind) => {
    const colorMap = {
      'INIT': 'info',
      'ASSIGN': 'primary',
      'REASSIGN': 'warning',
      'SUBMIT': 'success',
      'REVIEW': 'secondary',
      'NOTE': 'default',
      'START': 'success'
    };
    return colorMap[kind] || 'default';
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return { distance: 'Unknown time', formatted: 'No date available' };
    const date = timestamp.seconds 
      ? new Date(timestamp.seconds * 1000)
      : timestamp._seconds
      ? new Date(timestamp._seconds * 1000)
      : new Date(timestamp);
    
    try {
      const distance = formatDistanceToNow(date, { addSuffix: true });
      const formatted = format(date, 'MMM dd, yyyy • h:mm a');
      return { distance, formatted };
    } catch (e) {
      return { distance: 'Recently', formatted: 'Recent' };
    }
  };

  const workflowSteps = [
    { label: 'Assignment Received', icon: <Assignment /> },
    { label: 'Work Started', icon: <TrendingUp /> },
    { label: 'Submitted for Review', icon: <CloudUpload /> },
    { label: 'Review Complete', icon: <CheckCircle /> }
  ];

  const getCurrentStepIndex = (stream) => {
    const state = stream?.state || '';
    if (state.includes('DONE') || state.includes('READY')) return 3;
    if (state.includes('REVIEW')) return 2;
    if (state.includes('IN_PROGRESS')) return 1;
    if (state.includes('ASSIGNED')) return 0;
    return 0;
  };

  return (
    <Box sx={{ pb: 4 }}>
      {/* Breadcrumb Navigation */}
      <Breadcrumbs separator={<NavigateNext fontSize="small" />} sx={{ mb: 2, px: 2, pt: 2 }}>
        <Link component={RouterLink} underline="hover" color="inherit" to="/team">
          Team Dashboard
        </Link>
        <Link component={RouterLink} underline="hover" color="inherit" to="/team">
          My Assignments
        </Link>
        <Typography color="text.primary">
          {jobData?.eventName || 'Job Details'}
        </Typography>
      </Breadcrumbs>

      {/* Hero Section */}
      <Paper
        elevation={0}
        sx={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          p: 4,
          mb: 3,
          borderRadius: 3
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center" mb={2}>
          <Avatar sx={{ width: 56, height: 56, bgcolor: 'rgba(255,255,255,0.2)' }}>
            <VideoLibrary fontSize="large" />
          </Avatar>
          <Box flex={1}>
            <Typography variant="h4" fontWeight="bold">
              {jobData?.eventName || 'Post-Production Job'}
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9, mt: 0.5 }}>
              {jobData?.clientName && `Client: ${jobData.clientName} • `}
              Event ID: {eventId}
            </Typography>
          </Box>
        </Stack>

        {/* My Streams Summary */}
        <Grid container spacing={2} sx={{ mt: 2 }}>
          {myStreams.map((stream) => (
            <Grid item xs={12} md={6} key={stream.type}>
              <Card sx={{ bgcolor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)' }}>
                <CardContent>
                  <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                    {stream.type === 'photo' ? (
                      <PhotoLibrary sx={{ color: 'white' }} />
                    ) : (
                      <VideoLibrary sx={{ color: 'white' }} />
                    )}
                    <Typography variant="h6" color="white" fontWeight="bold">
                      {stream.type === 'photo' ? 'Photo Stream' : 'Video Stream'}
                    </Typography>
                    <Chip
                      label={stream.state?.replace('_', ' ') || 'ASSIGNED'}
                      size="small"
                      sx={{ bgcolor: 'rgba(255,255,255,0.3)', color: 'white' }}
                    />
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={getStreamProgress(stream)}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      bgcolor: 'rgba(255,255,255,0.2)',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: 'white',
                        borderRadius: 4
                      }
                    }}
                  />
                  <Typography variant="body2" sx={{ mt: 1, color: 'rgba(255,255,255,0.9)' }}>
                    {getStreamProgress(stream)}% Complete
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Paper>

      <Grid container spacing={3}>
        {/* Left Column - Timeline & Progress */}
        <Grid item xs={12} md={8}>
          {/* Workflow Progress */}
          {myStreams.map((stream) => (
            <Paper key={stream.type} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {stream.type === 'photo' ? <PhotoLibrary color="primary" /> : <VideoLibrary color="secondary" />}
                {stream.type === 'photo' ? 'Photo' : 'Video'} Workflow Progress
              </Typography>
              
              <Stepper activeStep={getCurrentStepIndex(stream)} orientation="vertical" sx={{ mt: 2 }}>
                {workflowSteps.map((step, index) => (
                  <Step key={step.label} completed={index < getCurrentStepIndex(stream)}>
                    <StepLabel
                      icon={
                        index < getCurrentStepIndex(stream) ? (
                          <CheckCircle color="success" />
                        ) : index === getCurrentStepIndex(stream) ? (
                          <RadioButtonUnchecked color="primary" />
                        ) : (
                          <RadioButtonUnchecked color="disabled" />
                        )
                      }
                    >
                      <Typography variant="body1" fontWeight={index === getCurrentStepIndex(stream) ? 'bold' : 'normal'}>
                        {step.label}
                      </Typography>
                    </StepLabel>
                    <StepContent>
                      {index === getCurrentStepIndex(stream) && (
                        <Alert severity="info" sx={{ mt: 1 }}>
                          Current status: {stream.state?.replace('_', ' ') || 'In Progress'}
                        </Alert>
                      )}
                    </StepContent>
                  </Step>
                ))}
              </Stepper>
            </Paper>
          ))}

          {/* Activity Timeline */}
          <Paper sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TimelineIcon color="primary" />
              Activity Timeline
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Real-time updates on your job progress
            </Typography>

            <List sx={{ mt: 2 }}>
              {formatActivityLog(activityData || []).map((activity, index) => {
                const time = formatTimestamp(activity.at);
                return (
                  <React.Fragment key={index}>
                    <ListItem
                      alignItems="flex-start"
                      sx={{
                        bgcolor: index === 0 ? 'action.hover' : 'transparent',
                        borderRadius: 2,
                        mb: 1
                      }}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: `${getActivityColor(activity.kind)}.main` }}>
                          {getActivityIcon(activity.kind)}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <Typography variant="body1" fontWeight="medium">
                              {activity.summary || activity.kind}
                            </Typography>
                            {activity.stream && (
                              <Chip
                                label={activity.stream}
                                size="small"
                                icon={activity.stream === 'photo' ? <PhotoLibrary /> : <VideoLibrary />}
                              />
                            )}
                            {index === 0 && <Chip label="Latest" size="small" color="success" />}
                          </Stack>
                        }
                        secondary={
                          <React.Fragment>
                            <Typography variant="caption" color="primary.main" fontWeight="bold" component="span" display="block" sx={{ mt: 1 }}>
                              {time.distance}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" component="span" display="block">
                              {time.formatted}
                            </Typography>
                          </React.Fragment>
                        }
                        secondaryTypographyProps={{ component: 'div' }}
                      />
                    </ListItem>
                    {index < formatActivityLog(activityData || []).length - 1 && <Divider />}
                  </React.Fragment>
                );
              })}
            </List>

            {(!activityData || activityData.length === 0) && (
              <Alert severity="info" sx={{ mt: 2 }}>
                No activity yet. Activity will appear here as work progresses.
              </Alert>
            )}
          </Paper>
        </Grid>

        {/* Right Column - Data Details & Team Info */}
        <Grid item xs={12} md={4}>
          {/* Storage Data Details */}
          {approvedSubmissions.length > 0 && (
            <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Storage color="primary" />
                Data Storage Details
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {approvedSubmissions.length} approved submission{approvedSubmissions.length !== 1 ? 's' : ''}
              </Typography>

              {/* Quick Reference Summary */}
              <Alert severity="info" icon={<Info />} sx={{ mt: 2, mb: 2 }}>
                <Typography variant="caption" fontWeight="bold" display="block" gutterBottom>
                  QUICK REFERENCE
                </Typography>
                <Stack spacing={0.5}>
                  <Typography variant="caption">
                    📦 Total Devices: <strong>{intakeSummary.totalDevices || 0}</strong>
                  </Typography>
                  <Typography variant="caption">
                    👥 Submissions: <strong>{approvedSubmissions.length}</strong>
                  </Typography>
                  {intakeSummary.estimatedDataSizes && intakeSummary.estimatedDataSizes.length > 0 && (
                    <Typography variant="caption">
                      💾 Est. Data: <strong>{intakeSummary.estimatedDataSizes.join(', ')}</strong>
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                    Expand submissions below for detailed device info, serial numbers, and storage locations
                  </Typography>
                </Stack>
              </Alert>

              <Stack spacing={2} sx={{ mt: 2 }}>
                {approvedSubmissions.map((submission, index) => {
                  // Extract location preview
                  const locationPreview = submission.storageLocation 
                    ? typeof submission.storageLocation === 'object'
                      ? `${submission.storageLocation.room || ''}${submission.storageLocation.cabinet ? ' / ' + submission.storageLocation.cabinet : ''}${submission.storageLocation.shelf ? ' / ' + submission.storageLocation.shelf : ''}${submission.storageLocation.bin ? ' / Bin ' + submission.storageLocation.bin : ''}`
                      : submission.storageLocation
                    : 'No location set';
                  
                  return (
                    <Accordion key={index} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
                      <AccordionSummary expandIcon={<ExpandMore />}>
                        <Stack spacing={0.5} flex={1}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Folder color="primary" fontSize="small" />
                            <Typography variant="body2" fontWeight="medium">
                              {submission.submitterName || `Submission ${index + 1}`}
                            </Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {submission.deviceCount || submission.devices?.length || 0} device{(submission.deviceCount || submission.devices?.length) !== 1 ? 's' : ''}
                            {submission.estimatedDataSize && ` • ${submission.estimatedDataSize}`}
                          </Typography>
                          {locationPreview && locationPreview !== 'No location set' && (
                            <Typography variant="caption" color="primary.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              📍 {locationPreview}
                            </Typography>
                          )}
                        </Stack>
                      </AccordionSummary>
                      <AccordionDetails>
                      <Stack spacing={2}>
                        {/* Submitter Info */}
                        <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                            SUBMITTED BY
                          </Typography>
                          <Typography variant="body2" fontWeight="medium">
                            {submission.submitterName || 'Unknown'}
                          </Typography>
                          {submission.approvedAt && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              Approved: {formatTimestamp(submission.approvedAt).formatted}
                            </Typography>
                          )}
                        </Box>

                        {/* Storage Devices */}
                        {submission.devices && submission.devices.length > 0 && (
                          <Box>
                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom sx={{ fontWeight: 600 }}>
                              STORAGE DEVICES ({submission.devices.length})
                            </Typography>
                            <Stack spacing={1.5}>
                              {submission.devices.map((device, dIndex) => (
                                <Card key={dIndex} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                                  <Stack spacing={0.5}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                      <Storage fontSize="small" color="primary" />
                                      <Typography variant="body2" fontWeight="medium">
                                        {device.type || 'Unknown Type'}
                                      </Typography>
                                      {device.capacity && (
                                        <Chip label={device.capacity} size="small" color="primary" variant="outlined" />
                                      )}
                                    </Stack>
                                    {device.brand && (
                                      <Typography variant="caption" color="text.secondary">
                                        Brand: {device.brand}
                                      </Typography>
                                    )}
                                    {device.model && (
                                      <Typography variant="caption" color="text.secondary">
                                        Model: {device.model}
                                      </Typography>
                                    )}
                                    {device.serialNumber && (
                                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                                        S/N: {device.serialNumber}
                                      </Typography>
                                    )}
                                    {device.notes && (
                                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                                        Note: {device.notes}
                                      </Typography>
                                    )}
                                  </Stack>
                                </Card>
                              ))}
                            </Stack>
                          </Box>
                        )}

                        {/* Storage Location */}
                        {submission.storageLocation && (
                          <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'primary.main', borderRadius: 1, bgcolor: 'primary.50' }}>
                            <Typography variant="caption" color="primary.main" display="block" gutterBottom sx={{ fontWeight: 600 }}>
                              📍 STORAGE LOCATION
                            </Typography>
                            <Stack spacing={0.5}>
                              {typeof submission.storageLocation === 'object' ? (
                                <>
                                  {submission.storageLocation.room && (
                                    <Typography variant="body2">
                                      <strong>Room:</strong> {submission.storageLocation.room}
                                    </Typography>
                                  )}
                                  {submission.storageLocation.cabinet && (
                                    <Typography variant="body2">
                                      <strong>Cabinet:</strong> {submission.storageLocation.cabinet}
                                    </Typography>
                                  )}
                                  {submission.storageLocation.shelf && (
                                    <Typography variant="body2">
                                      <strong>Shelf:</strong> {submission.storageLocation.shelf}
                                    </Typography>
                                  )}
                                  {submission.storageLocation.bin && (
                                    <Typography variant="body2">
                                      <strong>Bin:</strong> {submission.storageLocation.bin}
                                    </Typography>
                                  )}
                                  {submission.storageLocation.additionalNotes && (
                                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                                      {submission.storageLocation.additionalNotes}
                                    </Typography>
                                  )}
                                </>
                              ) : (
                                <Typography variant="body2">
                                  {submission.storageLocation}
                                </Typography>
                              )}
                            </Stack>
                          </Box>
                        )}

                        {/* Handoff Reference */}
                        {submission.handoffReference && (
                          <Box>
                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                              HANDOFF REFERENCE
                            </Typography>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                              {submission.handoffReference}
                            </Typography>
                          </Box>
                        )}

                        {/* Notes */}
                        {submission.notes && (
                          <Box>
                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                              NOTES
                            </Typography>
                            <Typography variant="body2" sx={{ p: 1.5, bgcolor: 'warning.50', borderRadius: 1, borderLeft: '3px solid', borderColor: 'warning.main' }}>
                              {submission.notes}
                            </Typography>
                          </Box>
                        )}

                        {/* Storage Assignment Info */}
                        {submission.storageAssignment && (
                          <Box sx={{ p: 1.5, bgcolor: 'info.50', borderRadius: 1 }}>
                            <Typography variant="caption" color="info.main" display="block" gutterBottom sx={{ fontWeight: 600 }}>
                              ℹ️ STORAGE MEDIUM INFO
                            </Typography>
                            <Stack spacing={0.5}>
                              {submission.storageAssignment.storageMedium && (
                                <>
                                  {submission.storageAssignment.storageMedium.name && (
                                    <Typography variant="body2">
                                      <strong>Medium:</strong> {submission.storageAssignment.storageMedium.name}
                                    </Typography>
                                  )}
                                  {submission.storageAssignment.storageMedium.type && (
                                    <Typography variant="body2">
                                      <strong>Type:</strong> {submission.storageAssignment.storageMedium.type}
                                    </Typography>
                                  )}
                                  {submission.storageAssignment.storageMedium.capacity && (
                                    <Typography variant="body2">
                                      <strong>Capacity:</strong> {submission.storageAssignment.storageMedium.capacity}
                                    </Typography>
                                  )}
                                </>
                              )}
                            </Stack>
                          </Box>
                        )}
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                  );
                })}

                {intakeSummary.totalDevices > 0 && (
                  <Alert severity="success" icon={<Storage />} sx={{ mt: 1 }}>
                    <strong>Total Devices: {intakeSummary.totalDevices}</strong>
                    {intakeSummary.approvedCount > 0 && (
                      <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                        from {intakeSummary.approvedCount} approved submission{intakeSummary.approvedCount !== 1 ? 's' : ''}
                      </Typography>
                    )}
                  </Alert>
                )}
              </Stack>
            </Paper>
          )}

          {/* Team Members */}
          {myStreams.length > 0 && (
            <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Group color="primary" />
                Team Members
              </Typography>

              {myStreams.map((stream) => (
                <Box key={stream.type} sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {stream.type === 'photo' ? 'Photo Team' : 'Video Team'}
                  </Typography>
                  <Stack spacing={1}>
                    {stream.editors?.map((editor, index) => (
                      <Card key={index} variant="outlined" sx={{ p: 1.5 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Avatar sx={{ width: 32, height: 32, bgcolor: editor.role === 'LEAD' ? 'primary.main' : 'secondary.main' }}>
                            <Person fontSize="small" />
                          </Avatar>
                          <Box flex={1}>
                            <Typography variant="body2" fontWeight="medium">
                              {editor.displayName || editor.name || 'Team Member'}
                            </Typography>
                            <Chip
                              label={editor.role || 'ASSIST'}
                              size="small"
                              color={editor.role === 'LEAD' ? 'primary' : 'default'}
                              sx={{ mt: 0.5 }}
                            />
                          </Box>
                        </Stack>
                      </Card>
                    ))}
                  </Stack>
                </Box>
              ))}
            </Paper>
          )}

          {/* Deadlines */}
          {myStreams.some(s => s.draftDue || s.finalDue) && (
            <Paper sx={{ p: 3, borderRadius: 2 }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AccessTime color="error" />
                Important Deadlines
              </Typography>

              <Stack spacing={2} sx={{ mt: 2 }}>
                {myStreams.map((stream) => (
                  <Box key={stream.type}>
                    {(stream.draftDue || stream.finalDue) && (
                      <>
                        <Typography variant="subtitle2" color="text.secondary">
                          {stream.type === 'photo' ? 'Photo Stream' : 'Video Stream'}
                        </Typography>
                        {stream.draftDue && (
                          <Alert severity="warning" sx={{ mt: 1, mb: 1 }}>
                            <Typography variant="body2" fontWeight="bold">
                              Draft Due
                            </Typography>
                            <Typography variant="caption">
                              {format(new Date(stream.draftDue), 'MMM dd, yyyy • h:mm a')}
                            </Typography>
                          </Alert>
                        )}
                        {stream.finalDue && (
                          <Alert severity="error" sx={{ mt: 1 }}>
                            <Typography variant="body2" fontWeight="bold">
                              Final Due
                            </Typography>
                            <Typography variant="caption">
                              {format(new Date(stream.finalDue), 'MMM dd, yyyy • h:mm a')}
                            </Typography>
                          </Alert>
                        )}
                      </>
                    )}
                  </Box>
                ))}
              </Stack>
            </Paper>
          )}
        </Grid>
      </Grid>
    </Box>
  );
};

export default EditorJobView;
