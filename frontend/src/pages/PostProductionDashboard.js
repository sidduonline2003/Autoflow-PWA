import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  Chip,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tab,
  Tabs,
  LinearProgress
} from '@mui/material';
import {
  Timeline,
  Assignment,
  Edit,
  Upload,
  CheckCircle,
  Schedule,
  Person,
  Refresh
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const PostProductionDashboard = () => {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [myTasks, setMyTasks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const statusColors = {
    'AI_EDITOR_ASSIGNMENT': 'warning',
    'EDITING_PENDING': 'warning',
    'EDITING_IN_PROGRESS': 'primary',
    'EDITING_REVIEW': 'secondary',
    'REVISION_NEEDED': 'error',
    'UPLOAD_PENDING': 'primary',
    'CLIENT_READY': 'success'
  };

  const statusIcons = {
    'AI_EDITOR_ASSIGNMENT': <Assignment />,
    'EDITING_PENDING': <Schedule />,
    'EDITING_IN_PROGRESS': <Edit />,
    'EDITING_REVIEW': <Timeline />,
    'REVISION_NEEDED': <Edit />,
    'UPLOAD_PENDING': <Upload />,
    'CLIENT_READY': <CheckCircle />
  };

  useEffect(() => {
    fetchDashboardData();
    fetchMyTasks();
  }, []);

  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchDashboardData();
        fetchMyTasks();
      }, 30000); // Refresh every 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const fetchDashboardData = async () => {
    try {
      // Get Firebase ID token instead of localStorage token
      const idToken = await user?.getIdToken();
      if (!idToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch('/api/events/post-production/dashboard', {
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
      } else {
        throw new Error('Failed to fetch dashboard data');
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError('Failed to load dashboard data');
    }
  };

  const fetchMyTasks = async () => {
    try {
      // Get Firebase ID token instead of localStorage token
      const idToken = await user?.getIdToken();
      if (!idToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch('/api/events/my-editing-tasks', {
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setMyTasks(data);
      } else {
        throw new Error('Failed to fetch my tasks');
      }
    } catch (error) {
      console.error('Error fetching my tasks:', error);
      setError('Failed to load my tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    fetchDashboardData();
    fetchMyTasks();
  };

  const getFilteredTasks = (tasks) => {
    if (statusFilter === 'all') return tasks;
    return tasks.filter(task => task.status === statusFilter);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const getStatusProgress = (status) => {
    if (!status) return 0;
    
    const statusOrder = [
      'AI_EDITOR_ASSIGNMENT',
      'EDITING_PENDING',
      'EDITING_IN_PROGRESS',
      'EDITING_REVIEW',
      'UPLOAD_PENDING',
      'CLIENT_READY'
    ];
    const currentIndex = statusOrder.indexOf(status);
    if (currentIndex >= 0) {
      return ((currentIndex + 1) / statusOrder.length) * 100;
    }
    
    // Default fallback for unknown statuses
    return 0;
  };

  if (loading && !dashboardData) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1" display="flex" alignItems="center">
          <Timeline sx={{ mr: 2 }} />
          Post-Production Dashboard
        </Typography>
        <Box>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={handleRefresh}
            sx={{ mr: 1 }}
          >
            Refresh
          </Button>
          <Button
            variant={autoRefresh ? "contained" : "outlined"}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            Auto Refresh {autoRefresh ? 'ON' : 'OFF'}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
        <Tab label="Overview" />
        <Tab label="My Tasks" />
        {user?.role === 'admin' && <Tab label="All Tasks" />}
      </Tabs>

      {/* Overview Tab */}
      {activeTab === 0 && (
        <>
          {/* Summary Cards */}
          {dashboardData?.summary && (
            <Grid container spacing={3} sx={{ mb: 4 }}>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      Total Tasks
                    </Typography>
                    <Typography variant="h4">
                      {dashboardData.summary.totalTasks}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      Active Tasks
                    </Typography>
                    <Typography variant="h4" color="primary">
                      {dashboardData.summary.activeTasks}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      In Progress
                    </Typography>
                    <Typography variant="h4" color="warning.main">
                      {dashboardData.summary.inProgressTasks}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      Completed
                    </Typography>
                    <Typography variant="h4" color="success.main">
                      {dashboardData.summary.completedTasks}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          {/* Recent Activity */}
          {myTasks?.myTasks && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  My Recent Tasks
                </Typography>
                {myTasks.myTasks.slice(0, 5).map((task) => (
                  <Box key={task.taskId} display="flex" alignItems="center" py={1} borderBottom="1px solid #eee">
                    <Box mr={2}>
                      {statusIcons[task.status] || <Schedule />}
                    </Box>
                    <Box flexGrow={1}>
                      <Typography variant="subtitle2">
                        {task.eventName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {task.myRole} • {task.eventType}
                      </Typography>
                    </Box>
                    <Chip
                      label={task.status.replace(/_/g, ' ')}
                      color={statusColors[task.status] || 'default'}
                      size="small"
                    />
                  </Box>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* My Tasks Tab */}
      {activeTab === 1 && myTasks && (
        <>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
            <Typography variant="h6">
              My Editing Tasks ({myTasks.totalTasks})
            </Typography>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Filter by Status</InputLabel>
              <Select
                value={statusFilter}
                label="Filter by Status"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="EDITING_PENDING">Pending</MenuItem>
                <MenuItem value="EDITING_IN_PROGRESS">In Progress</MenuItem>
                <MenuItem value="EDITING_REVIEW">Review</MenuItem>
                <MenuItem value="REVISION_NEEDED">Needs Revision</MenuItem>
                <MenuItem value="UPLOAD_PENDING">Upload Pending</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Event</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>My Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Progress</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {getFilteredTasks(myTasks.myTasks).map((task) => (
                  <TableRow key={task.taskId}>
                    <TableCell>
                      <Typography variant="subtitle2">
                        {task.eventName}
                      </Typography>
                    </TableCell>
                    <TableCell>{task.eventType}</TableCell>
                    <TableCell>{task.myRole}</TableCell>
                    <TableCell>
                      <Chip
                        label={task.status.replace(/_/g, ' ')}
                        color={statusColors[task.status] || 'default'}
                        size="small"
                        icon={statusIcons[task.status]}
                      />
                    </TableCell>
                    <TableCell>
                      <Box width="100px">
                        <LinearProgress
                          variant="determinate"
                          value={task.completionPercentage || getStatusProgress(task.status)}
                          sx={{ mb: 0.5 }}
                        />
                        <Typography variant="caption">
                          {Math.round(task.completionPercentage || getStatusProgress(task.status))}%
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{formatDate(task.createdAt)}</TableCell>
                    <TableCell>
                      {task.canEdit && (
                        <Button size="small" variant="outlined">
                          Work on Task
                        </Button>
                      )}
                      {task.canUpload && (
                        <Button size="small" variant="contained" color="primary">
                          Upload
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* All Tasks Tab (Admin only) */}
      {activeTab === 2 && user?.role === 'admin' && dashboardData && (
        <>
          <Typography variant="h6" gutterBottom>
            All Post-Production Tasks
          </Typography>
          
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Event</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Primary Editor</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Complexity</TableCell>
                  <TableCell>Est. Hours</TableCell>
                  <TableCell>Time Spent</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {dashboardData.activeTasks.map((task) => (
                  <TableRow key={task.taskId}>
                    <TableCell>
                      <Typography variant="subtitle2">
                        {task.eventName}
                      </Typography>
                    </TableCell>
                    <TableCell>{task.eventType}</TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <Person sx={{ mr: 1, fontSize: 16 }} />
                        {task.primaryEditorName || 'Unassigned'}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={task.status.replace(/_/g, ' ')}
                        color={statusColors[task.status] || 'default'}
                        size="small"
                        icon={statusIcons[task.status]}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={task.complexity}
                        color={task.complexity === 'complex' ? 'error' : task.complexity === 'medium' ? 'warning' : 'success'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{task.estimatedHours}h</TableCell>
                    <TableCell>{task.totalTimeSpent || 0}h</TableCell>
                    <TableCell>{formatDate(task.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Container>
  );
};

export default PostProductionDashboard;
