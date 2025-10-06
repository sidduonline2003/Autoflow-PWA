import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ShieldIcon from '@mui/icons-material/Shield';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import HistoryIcon from '@mui/icons-material/History';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import ReplayIcon from '@mui/icons-material/Replay';
import GroupIcon from '@mui/icons-material/Group';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

const ROLE_OPTIONS = [
  'ADMIN',
  'EDITOR',
  'PRODUCER',
  'QA',
  'DATA_MANAGER',
  'POST_SUPERVISOR',
  'SHOOT_SUPERVISOR',
  'SUPPORT',
];

const rampGuidance = [
  'Start allocations below 500 ops/sec per role/org and increase gradually.',
  'Monitor latency and abort retry logs; sustained spikes indicate contention.',
  'If a single role runs hot, shard counters per role while keeping unique index enforcement.',
  'Enable exponential backoff in any batch tooling to respect Firestore limits.',
];

const ASSIGNMENT_STATUS_META = {
  assigned: { label: 'Assigned', color: 'success' },
  skipped: { label: 'Skipped (already had code)', color: 'default' },
  missing_role: { label: 'Missing role', color: 'warning' },
  not_found: { label: 'Not found', color: 'error' },
  conflict: { label: 'Collision', color: 'error' },
  failed: { label: 'Failed', color: 'error' },
  error: { label: 'Error', color: 'error' },
  loading: { label: 'Working…', color: 'info' },
  unknown: { label: 'Unknown', color: 'default' },
};

const AdminSettingsPage = () => {
  const { user, claims } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ orgCode: '', role: 'EDITOR', teammateUid: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [history, setHistory] = useState([]);
  const [copyMessage, setCopyMessage] = useState('');
  const [teamMembers, setTeamMembers] = useState([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [rowAssignments, setRowAssignments] = useState({});
  const [assignmentSummary, setAssignmentSummary] = useState(null);
  
  // Pattern editor state
  const [codePattern, setCodePattern] = useState('{ORGCODE}-{ROLE}-{NUMBER:5}');
  const [isEditingPattern, setIsEditingPattern] = useState(false);
  const [patternDraft, setPatternDraft] = useState('');
  const [isSavingPattern, setIsSavingPattern] = useState(false);
  
  // Pattern builder state
  const [patternComponents, setPatternComponents] = useState([
    { type: 'orgcode', separator: '-' },
    { type: 'role', separator: '-' },
    { type: 'number', digits: 5, separator: '' }
  ]);

  const formatRoleLabel = useCallback((roleValue) => {
    if (!roleValue) return '—';
    return roleValue
      .toString()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/(^|\s)\w/g, (match) => match.toUpperCase());
  }, []);

  const isAdmin = useMemo(() => (claims?.role || '').toLowerCase() === 'admin', [claims?.role]);

  const summarizeResults = useCallback((orgCode, results, scope) => {
    if (!Array.isArray(results)) {
      setAssignmentSummary(null);
      return;
    }

    const counts = results.reduce((acc, item) => {
      const statusKey = item?.status || 'unknown';
      acc[statusKey] = (acc[statusKey] || 0) + 1;
      return acc;
    }, {});

    setAssignmentSummary({
      orgCode: orgCode || null,
      results,
      counts,
      scope,
      timestamp: Date.now(),
    });
  }, []);

  const loadTeamMembers = useCallback(async () => {
    if (!user || !isAdmin) {
      setTeamMembers([]);
      return;
    }

    setIsLoadingTeam(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/team', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail?.detail || 'Unable to fetch team members.');
      }

      const data = await response.json();
      const mapped = (Array.isArray(data) ? data : []).map((member) => {
        const employeeCode = member?.employeeCode
          || member?.profile?.employeeCode
          || null;
        return {
          ...member,
          employeeCode,
        };
      });

      mapped.sort((a, b) => {
        const nameA = (a?.name || a?.profile?.name || a?.email || '').toLowerCase();
        const nameB = (b?.name || b?.profile?.name || b?.email || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });

      setTeamMembers(mapped);
    } catch (err) {
      setError(err.message || 'Unexpected error while loading teammates.');
    } finally {
      setIsLoadingTeam(false);
    }
  }, [user, isAdmin]);

  const loadCodePattern = useCallback(async () => {
    if (!user || !isAdmin) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/team/code-pattern', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const pattern = data.pattern || '{ORGCODE}-{ROLE}-{NUMBER:5}';
        setCodePattern(pattern);
        parsePatternToComponents(pattern);
      }
    } catch (err) {
      // Silently fail - use default pattern
      console.warn('Could not load code pattern:', err);
    }
  }, [user, isAdmin]);

  // Parse pattern string to component array
  const parsePatternToComponents = (pattern) => {
    const components = [];
    const regex = /\{ORGCODE\}|\{ROLE\}|\{NUMBER:?(\d*)\}|([^{}]+)/g;
    let match;
    
    while ((match = regex.exec(pattern)) !== null) {
      if (match[0] === '{ORGCODE}') {
        components.push({ type: 'orgcode', separator: '' });
      } else if (match[0] === '{ROLE}') {
        components.push({ type: 'role', separator: '' });
      } else if (match[0].startsWith('{NUMBER')) {
        const digits = match[1] ? parseInt(match[1]) : 0;
        components.push({ type: 'number', digits: digits || 5, separator: '' });
      } else if (match[2]) {
        // Custom text separator
        const lastComponent = components[components.length - 1];
        if (lastComponent) {
          lastComponent.separator = match[2];
        }
      }
    }
    
    setPatternComponents(components.length > 0 ? components : [
      { type: 'orgcode', separator: '-' },
      { type: 'role', separator: '-' },
      { type: 'number', digits: 5, separator: '' }
    ]);
  };

  // Convert components array to pattern string
  const componentsToPattern = (components) => {
    return components.map(comp => {
      let part = '';
      if (comp.type === 'orgcode') {
        part = '{ORGCODE}';
      } else if (comp.type === 'role') {
        part = '{ROLE}';
      } else if (comp.type === 'number') {
        part = comp.digits ? `{NUMBER:${comp.digits}}` : '{NUMBER}';
      } else if (comp.type === 'text') {
        part = comp.text || '';
      }
      return part + comp.separator;
    }).join('');
  };

  const handleEditPattern = () => {
    parsePatternToComponents(codePattern);
    setIsEditingPattern(true);
  };

  const handleCancelEditPattern = () => {
    setIsEditingPattern(false);
  };

  const handleAddComponent = () => {
    setPatternComponents([...patternComponents, { type: 'text', text: '', separator: '' }]);
  };

  const handleRemoveComponent = (index) => {
    const newComponents = patternComponents.filter((_, i) => i !== index);
    setPatternComponents(newComponents);
  };

  const handleComponentChange = (index, field, value) => {
    const newComponents = [...patternComponents];
    newComponents[index] = { ...newComponents[index], [field]: value };
    
    // Reset fields when type changes
    if (field === 'type') {
      if (value === 'number') {
        newComponents[index].digits = 5;
        delete newComponents[index].text;
      } else if (value === 'text') {
        newComponents[index].text = '';
        delete newComponents[index].digits;
      } else {
        delete newComponents[index].digits;
        delete newComponents[index].text;
      }
    }
    
    setPatternComponents(newComponents);
  };

  const handleSavePattern = async () => {
    if (!user) return;

    setIsSavingPattern(true);
    setError(null);

    try {
      const pattern = componentsToPattern(patternComponents);
      
      // Validate pattern has at least NUMBER
      if (!pattern.includes('{NUMBER')) {
        throw new Error('Pattern must include {NUMBER} placeholder');
      }

      const token = await user.getIdToken();
      const response = await fetch('/api/team/code-pattern', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pattern }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail?.detail || 'Failed to update code pattern.');
      }

      const data = await response.json();
      setCodePattern(data.pattern);
      setIsEditingPattern(false);
      setSuccess({ code: 'Pattern updated successfully!', latencyMs: 0 });
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to save pattern.');
    } finally {
      setIsSavingPattern(false);
    }
  };

  useEffect(() => {
    loadTeamMembers();
    loadCodePattern();
  }, [loadTeamMembers, loadCodePattern]);

  const updateRowAssignments = useCallback((results, overrides = {}) => {
    setRowAssignments((prev) => {
      const next = { ...prev };
      if (Array.isArray(results)) {
        results.forEach((result) => {
          if (result?.teammateUid) {
            next[result.teammateUid] = { ...result };
          }
        });
      }
      Object.entries(overrides).forEach(([uid, value]) => {
        next[uid] = value;
      });
      return next;
    });
  }, []);

  const handleAssignForMember = useCallback(async (member, { force = false } = {}) => {
    if (!member?.id) {
      return;
    }
    if (!user) {
      setError('You must be signed in to manage teammate codes.');
      return;
    }

    setAssignmentSummary(null);
    updateRowAssignments([], { [member.id]: { status: 'loading' } });

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/team/codes/assign', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ teammateUids: [member.id], force }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail?.detail || 'Failed to assign teammate code.');
      }

      const payload = await response.json();
      const results = Array.isArray(payload?.results) ? payload.results : [];
      summarizeResults(payload?.orgCode, results, force ? 'single-force' : 'single');
      updateRowAssignments(results);
      await loadTeamMembers();
    } catch (err) {
      setError(err.message || 'Unexpected error while assigning code.');
      updateRowAssignments([], {
        [member.id]: {
          status: 'error',
          error: err.message || 'Request failed',
          teammateUid: member.id,
        },
      });
    }
  }, [loadTeamMembers, summarizeResults, updateRowAssignments, user]);

  const handleBulkAssign = useCallback(async ({ force = false, onlyMissing = false } = {}) => {
    if (!user) {
      setError('You must be signed in to manage teammate codes.');
      return;
    }

    const targetMembers = teamMembers.filter((member) => {
      if (!member?.id) {
        return false;
      }
      if (onlyMissing) {
        return !member?.employeeCode;
      }
      return true;
    });

    const teammateUids = targetMembers.map((member) => member.id);
    if (teammateUids.length === 0) {
      summarizeResults(null, [], onlyMissing ? 'missing-none' : 'force-none');
      return;
    }

    setAssignmentSummary(null);
    setBulkAssigning(true);
    updateRowAssignments([], teammateUids.reduce((acc, uid) => ({ ...acc, [uid]: { status: 'loading' } }), {}));

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/team/codes/assign', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ teammateUids, force }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail?.detail || 'Failed to assign teammate codes.');
      }

      const payload = await response.json();
      const results = Array.isArray(payload?.results) ? payload.results : [];
      summarizeResults(payload?.orgCode, results, onlyMissing ? 'missing' : force ? 'force-all' : 'all');
      updateRowAssignments(results);
      await loadTeamMembers();
    } catch (err) {
      setError(err.message || 'Unexpected error while assigning codes.');
      updateRowAssignments([], teammateUids.reduce((acc, uid) => ({
        ...acc,
        [uid]: {
          status: 'error',
          error: err.message || 'Request failed',
          teammateUid: uid,
        },
      }), {}));
    } finally {
      setBulkAssigning(false);
    }
  }, [loadTeamMembers, summarizeResults, teamMembers, updateRowAssignments, user]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === 'orgCode' || name === 'role' ? value.toUpperCase() : value,
    }));
  };

  const validateForm = () => {
    if (!form.orgCode.trim()) {
      setError('Organization code is required.');
      return false;
    }
    if (!/^[A-Z0-9-]+$/.test(form.orgCode.trim())) {
      setError('Organization code can only contain letters, numbers, and dashes.');
      return false;
    }
    if (!form.role.trim()) {
      setError('Role is required.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!validateForm()) {
      return;
    }

    if (!user) {
      setError('You must be signed in to generate codes.');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await user.getIdToken();
      const payload = {
        orgCode: form.orgCode.trim().toUpperCase(),
        role: form.role.trim().toUpperCase(),
      };
      const trimmedUid = form.teammateUid.trim();
      if (trimmedUid) {
        payload.teammateUid = trimmedUid;
      }

      const requestStartedAt = performance.now();
      const response = await fetch('/api/team/codes', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail?.detail || 'Failed to generate teammate code.');
      }

      const data = await response.json();
      const latencyMs = Math.round(performance.now() - requestStartedAt);

      setSuccess({ code: data.code, latencyMs, payload });
      setHistory((prev) => [
        {
          code: data.code,
          orgCode: payload.orgCode,
          role: payload.role,
          teammateUid: payload.teammateUid || null,
          createdAt: new Date().toISOString(),
          latencyMs,
        },
        ...prev,
      ].slice(0, 8));
    } catch (err) {
      setError(err.message || 'Unexpected error while allocating code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyMessage(`Copied ${code} to clipboard`);
      setTimeout(() => setCopyMessage(''), 2000);
    } catch (err) {
      setCopyMessage('Unable to copy code');
      setTimeout(() => setCopyMessage(''), 2000);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  };

  if (!isAdmin) {
    return (
      <>
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>Settings</Typography>
            <Button color="inherit" onClick={() => navigate('/dashboard')}>Dashboard</Button>
            <Button color="inherit" onClick={handleLogout}>Logout</Button>
          </Toolbar>
        </AppBar>
        <Container maxWidth="md" sx={{ py: 6 }}>
          <Alert severity="warning" icon={<ShieldIcon fontSize="inherit" />}>
            You need admin privileges to access teammate code settings.
          </Alert>
        </Container>
      </>
    );
  }

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>Settings</Typography>
          <Button color="inherit" onClick={() => navigate('/dashboard')}>Dashboard</Button>
          <Button color="inherit" onClick={() => navigate('/team')}>Team Management</Button>
          <Button color="inherit" onClick={() => navigate('/clients')}>Client Management</Button>
          <Button color="inherit" onClick={() => navigate('/attendance')}>Live Attendance</Button>
          <Button color="inherit" onClick={() => navigate('/financial')}>Financial Hub</Button>
          <Button color="inherit" onClick={handleLogout}>Logout</Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 6 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AutoAwesomeIcon color="primary" />
            Teammate Code Settings
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Generate stateless teammate codes per organization and role. Codes are unique, immutable, and logged through Firestore transactions.
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert
            severity="success"
            action={(
              <Tooltip title="Copy code">
                <IconButton color="inherit" size="small" onClick={() => handleCopy(success.code)}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          >
            Issued code <strong>{success.code}</strong> in {success.latencyMs} ms.
          </Alert>
        )}

        {copyMessage && (
          <Alert severity="info" onClose={() => setCopyMessage('')}>
            {copyMessage}
          </Alert>
        )}

        {/* Code Pattern Editor */}
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <EditIcon />
                  Employee Code Pattern Builder
                </Typography>
                {!isEditingPattern && (
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={handleEditPattern}
                  >
                    Edit Pattern
                  </Button>
                )}
              </Box>

              {!isEditingPattern ? (
                <Box>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Current Pattern:
                    </Typography>
                    <Typography variant="h6" fontFamily="monospace">
                      {codePattern}
                    </Typography>
                  </Paper>
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Example Output:
                    </Typography>
                    <Typography variant="body2" fontFamily="monospace" sx={{ color: 'primary.main' }}>
                      {codePattern
                        .replace('{ORGCODE}', form.orgCode || 'ORGA')
                        .replace('{ROLE}', 'EDITOR')
                        .replace(/{NUMBER:(\d+)}/g, (_, digits) => '1'.padStart(parseInt(digits), '0'))
                        .replace(/{NUMBER}/g, '1')}
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <Stack spacing={3}>
                  <Alert severity="info">
                    <Typography variant="body2">
                      Build your custom employee code pattern by adding components and choosing separators between them.
                    </Typography>
                  </Alert>

                  {patternComponents.map((component, index) => (
                    <Paper key={index} sx={{ p: 2, bgcolor: 'grey.50' }}>
                      <Stack spacing={2}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                          {/* Component Type Dropdown */}
                          <FormControl sx={{ minWidth: 150 }}>
                            <InputLabel>Component Type</InputLabel>
                            <Select
                              value={component.type}
                              label="Component Type"
                              onChange={(e) => handleComponentChange(index, 'type', e.target.value)}
                              disabled={isSavingPattern}
                            >
                              <MenuItem value="orgcode">Organization Code</MenuItem>
                              <MenuItem value="role">Role</MenuItem>
                              <MenuItem value="number">Sequential Number</MenuItem>
                              <MenuItem value="text">Custom Text</MenuItem>
                            </Select>
                          </FormControl>

                          {/* Number Digits Dropdown (only for number type) */}
                          {component.type === 'number' && (
                            <FormControl sx={{ minWidth: 120 }}>
                              <InputLabel>Digits</InputLabel>
                              <Select
                                value={component.digits || 5}
                                label="Digits"
                                onChange={(e) => handleComponentChange(index, 'digits', e.target.value)}
                                disabled={isSavingPattern}
                              >
                                <MenuItem value={3}>3 (001)</MenuItem>
                                <MenuItem value={4}>4 (0001)</MenuItem>
                                <MenuItem value={5}>5 (00001)</MenuItem>
                                <MenuItem value={6}>6 (000001)</MenuItem>
                                <MenuItem value={0}>None (1)</MenuItem>
                              </Select>
                            </FormControl>
                          )}

                          {/* Custom Text Input (only for text type) */}
                          {component.type === 'text' && (
                            <TextField
                              label="Custom Text"
                              value={component.text || ''}
                              onChange={(e) => handleComponentChange(index, 'text', e.target.value)}
                              placeholder="Enter text"
                              disabled={isSavingPattern}
                              sx={{ minWidth: 150 }}
                            />
                          )}

                          {/* Separator Dropdown */}
                          <FormControl sx={{ minWidth: 120 }}>
                            <InputLabel>Separator</InputLabel>
                            <Select
                              value={component.separator || ''}
                              label="Separator"
                              onChange={(e) => handleComponentChange(index, 'separator', e.target.value)}
                              disabled={isSavingPattern}
                            >
                              <MenuItem value="">None</MenuItem>
                              <MenuItem value="-">Dash (-)</MenuItem>
                              <MenuItem value="/">Slash (/)</MenuItem>
                              <MenuItem value="_">Underscore (_)</MenuItem>
                              <MenuItem value=".">Dot (.)</MenuItem>
                              <MenuItem value=" ">Space ( )</MenuItem>
                            </Select>
                          </FormControl>

                          {/* Remove Button */}
                          <IconButton
                            color="error"
                            onClick={() => handleRemoveComponent(index)}
                            disabled={isSavingPattern || patternComponents.length === 1}
                            sx={{ mt: 1 }}
                            title="Remove component"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>

                        {/* Component Preview */}
                        <Box sx={{ pl: 2 }}>
                          <Typography variant="caption" color="text.secondary">
                            Preview: <code style={{ fontFamily: 'monospace', color: '#1976d2' }}>
                              {component.type === 'orgcode' ? 'ORGA' : 
                               component.type === 'role' ? 'EDITOR' :
                               component.type === 'number' ? '1'.padStart(component.digits || 5, '0') :
                               component.text || '___'}
                              {component.separator}
                            </code>
                          </Typography>
                        </Box>
                      </Stack>
                    </Paper>
                  ))}

                  <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={handleAddComponent}
                    disabled={isSavingPattern}
                  >
                    Add Component
                  </Button>

                  <Divider />

                  <Box>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Full Pattern Preview:
                    </Typography>
                    <Paper sx={{ p: 2, bgcolor: 'primary.50' }}>
                      <Typography variant="h6" fontFamily="monospace" sx={{ color: 'primary.main' }}>
                        {patternComponents.map(comp => {
                          const value = comp.type === 'orgcode' ? 'ORGA' :
                                       comp.type === 'role' ? 'EDITOR' :
                                       comp.type === 'number' ? '1'.padStart(comp.digits || 5, '0') :
                                       comp.text || '';
                          return value + comp.separator;
                        }).join('')}
                      </Typography>
                    </Paper>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="contained"
                      startIcon={<SaveIcon />}
                      onClick={handleSavePattern}
                      disabled={isSavingPattern}
                    >
                      {isSavingPattern ? 'Saving...' : 'Save Pattern'}
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<CancelIcon />}
                      onClick={handleCancelEditPattern}
                      disabled={isSavingPattern}
                    >
                      Cancel
                    </Button>
                  </Box>
                </Stack>
              )}
            </Stack>
          </CardContent>
        </Card>

        <Card component="form" onSubmit={handleSubmit}>
          <CardContent>
            <Stack spacing={3}>
              <Typography variant="h6">Allocate a Teammate Code</Typography>
              <Box
                display="grid"
                gap={3}
                sx={{ gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}
              >
                <Box>
                  <TextField
                    label="Org Code"
                    name="orgCode"
                    value={form.orgCode}
                    onChange={handleInputChange}
                    placeholder="ASTRO"
                    fullWidth
                    required
                    helperText="Matches /indexes/orgCodes/codes/{ORG}"
                  />
                </Box>
                <Box>
                  <FormControl fullWidth required>
                    <InputLabel id="role-select-label">Role</InputLabel>
                    <Select
                      labelId="role-select-label"
                      label="Role"
                      name="role"
                      value={form.role}
                      onChange={handleInputChange}
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <MenuItem key={role} value={role}>
                          {role.replace(/_/g, ' ')}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
                <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
                  <TextField
                    label="Teammate UID (optional)"
                    name="teammateUid"
                    value={form.teammateUid}
                    onChange={handleInputChange}
                    placeholder="Firebase Auth UID"
                    fullWidth
                    helperText="Attach the code to an existing teammate profile"
                  />
                </Box>
              </Box>
              <Stack direction="row" spacing={2}>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={isSubmitting}
                  startIcon={<AutoAwesomeIcon />}
                >
                  {isSubmitting ? 'Allocating…' : 'Generate Code'}
                </Button>
                <Button
                  type="button"
                  variant="outlined"
                  disabled={isSubmitting}
                  onClick={() => {
                    setForm({ orgCode: '', role: 'EDITOR', teammateUid: '' });
                    setError(null);
                    setSuccess(null);
                  }}
                  startIcon={<ReplayIcon />}
                >
                  Reset
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        {history.length > 0 && (
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                <HistoryIcon color="action" />
                <Typography variant="h6">Recent allocations</Typography>
              </Stack>
              <List aria-label="recent code allocations">
                {history.map((entry) => (
                  <ListItem key={`${entry.code}-${entry.createdAt}`} divider>
                    <ListItemText
                      primary={(
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip label={entry.role} color="primary" size="small" />
                          <Typography variant="subtitle1" component="span">
                            {entry.code}
                          </Typography>
                        </Stack>
                      )}
                      secondary={`Org ${entry.orgCode} • ${entry.teammateUid ? `Attached to ${entry.teammateUid}` : 'Unassigned'} • ${new Date(entry.createdAt).toLocaleString()} • ${entry.latencyMs} ms`}
                    />
                    <Tooltip title="Copy code">
                      <IconButton edge="end" onClick={() => handleCopy(entry.code)}>
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} mb={2}>
              <GroupIcon color="primary" />
              <Typography variant="h6">Teammate code overview</Typography>
            </Stack>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              justifyContent="space-between"
              alignItems={{ xs: 'stretch', sm: 'center' }}
              mb={2}
            >
              <Typography variant="body2" color="text.secondary">
                Review teammate records, copy their IDs, or assign codes to anyone still missing.
              </Typography>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  size="small"
                  variant="contained"
                  disabled={bulkAssigning || isLoadingTeam || !teamMembers.some((member) => !member?.employeeCode)}
                  onClick={() => handleBulkAssign({ force: false, onlyMissing: true })}
                >
                  {bulkAssigning ? 'Assigning…' : 'Assign missing codes'}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={bulkAssigning || isLoadingTeam || teamMembers.length === 0}
                  onClick={() => handleBulkAssign({ force: true, onlyMissing: false })}
                >
                  {bulkAssigning ? 'Working…' : 'Force reissue all'}
                </Button>
              </Stack>
            </Stack>

            {isLoadingTeam ? (
              <LinearProgress />
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Role</TableCell>
                      <TableCell>Employee ID</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {teamMembers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>
                            No teammates found for this organization.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                    {teamMembers.map((member) => {
                      const memberId = member?.id;
                      const rowState = rowAssignments[memberId];
                      const isRowLoading = rowState?.status === 'loading';
                      const employeeCode = member?.employeeCode || null;
                      const statusKey = rowState?.status || (employeeCode ? 'assigned' : 'unknown');
                      const statusMeta = ASSIGNMENT_STATUS_META[statusKey] || ASSIGNMENT_STATUS_META.unknown;
                      const memberName = member?.name || member?.profile?.name || member?.email || 'Unnamed teammate';
                      const memberEmail = member?.email || member?.profile?.email || '—';
                      const roleLabel = formatRoleLabel(member?.role || member?.profile?.role);

                      return (
                        <TableRow key={memberId} hover>
                          <TableCell>{memberName}</TableCell>
                          <TableCell>{memberEmail}</TableCell>
                          <TableCell>{roleLabel}</TableCell>
                          <TableCell>
                            {employeeCode ? (
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Chip size="small" color="success" label={employeeCode} />
                                <Tooltip title="Copy employee ID">
                                  <span>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleCopy(employeeCode)}
                                      aria-label="copy employee id"
                                    >
                                      <ContentCopyIcon fontSize="inherit" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              </Stack>
                            ) : (
                              <Chip size="small" color="warning" variant="outlined" label="Not assigned" />
                            )}
                          </TableCell>
                          <TableCell>
                            {isRowLoading ? (
                              <Stack direction="row" spacing={1} alignItems="center">
                                <CircularProgress size={16} thickness={5} />
                                <Typography variant="caption">Assigning…</Typography>
                              </Stack>
                            ) : (
                              <Chip size="small" color={statusMeta.color} label={statusMeta.label} variant={statusKey === 'assigned' ? 'filled' : 'outlined'} />
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                              {!employeeCode && (
                                <Button
                                  size="small"
                                  variant="contained"
                                  onClick={() => handleAssignForMember(member, { force: false })}
                                  disabled={isRowLoading || bulkAssigning}
                                >
                                  {isRowLoading ? 'Assigning…' : 'Assign code'}
                                </Button>
                              )}
                              {employeeCode && (
                                <Tooltip title="Force a new code if you need to rotate credentials.">
                                  <span>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      onClick={() => handleAssignForMember(member, { force: true })}
                                      disabled={isRowLoading || bulkAssigning}
                                    >
                                      {isRowLoading ? 'Assigning…' : 'Force reissue'}
                                    </Button>
                                  </span>
                                </Tooltip>
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {assignmentSummary && (
              <Alert
                sx={{ mt: 2 }}
                severity={(assignmentSummary.counts?.failed
                  || assignmentSummary.counts?.conflict
                  || assignmentSummary.counts?.missing_role
                  || assignmentSummary.counts?.not_found
                  || assignmentSummary.counts?.error)
                  ? 'warning'
                  : assignmentSummary.counts?.assigned
                    ? 'success'
                    : 'info'}
              >
                <Stack spacing={1}>
                  <Typography variant="subtitle2">
                    Assignment run {new Date(assignmentSummary.timestamp).toLocaleTimeString()} •
                    {' '}
                    {(() => {
                      switch (assignmentSummary.scope) {
                        case 'missing':
                          return 'Processed teammates missing a code';
                        case 'missing-none':
                          return 'No teammates were missing a code';
                        case 'force-all':
                          return 'Force reissued codes for all teammates';
                        case 'force-none':
                          return 'All teammates already processed';
                        case 'single-force':
                          return 'Force reissued code for selected teammate';
                        case 'single':
                          return 'Assigned code to selected teammate';
                        default:
                          return 'Processed teammate assignment request';
                      }
                    })()}
                    {assignmentSummary.orgCode ? ` • Org code ${assignmentSummary.orgCode}` : ''}
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {Object.entries(assignmentSummary.counts || {}).map(([status, count]) => {
                      const meta = ASSIGNMENT_STATUS_META[status] || ASSIGNMENT_STATUS_META.unknown;
                      return (
                        <Chip
                          key={`${status}-${count}`}
                          size="small"
                          color={meta.color}
                          variant="outlined"
                          label={`${meta.label}: ${count}`}
                        />
                      );
                    })}
                    {!(assignmentSummary.counts && Object.keys(assignmentSummary.counts).length) && (
                      <Chip size="small" label="No teammates targeted" />
                    )}
                  </Stack>
                </Stack>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} mb={2}>
              <TipsAndUpdatesIcon color="warning" />
              <Typography variant="h6">Throughput & scale tips</Typography>
            </Stack>
            <Box
              display="grid"
              gap={2}
              sx={{ gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 2fr) minmax(0, 1fr)' } }}
            >
              <Box>
                <List>
                  {rampGuidance.map((tip) => (
                    <ListItem key={tip} sx={{ py: 0.5 }}>
                      <ListItemText primary={tip} />
                    </ListItem>
                  ))}
                </List>
              </Box>
              <Box display="flex" flexDirection="column" alignItems="flex-start" gap={1}>
                <Chip icon={<RocketLaunchIcon />} label="Ramp gradually" color="secondary" variant="outlined" />
                <Chip icon={<ShieldIcon />} label="Monitor aborts" color="info" variant="outlined" />
              </Box>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Typography variant="body2" color="text.secondary">
              Codes are stored as fields on teammate profiles and in the global index. Avoid reusing codes or manually editing the counter documents to maintain transactional guarantees.
            </Typography>
          </CardContent>
        </Card>
      </Stack>
    </Container>
    </>
  );
};

export default AdminSettingsPage;
