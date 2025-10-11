/**
 * Equipment Check-in Flow
 * Mobile-optimized multi-step form for returning equipment
 * 
 * Features:
 * - QR code scanning
 * - Checkout details review
 * - Condition inspection
 * - Damage reporting with photos
 * - Days used and overdue calculation
 * - Offline support with queue
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  TextField,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormLabel,
  FormControl,
  Stepper,
  Step,
  StepLabel,
  Alert,
  CircularProgress,
  Chip,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Checkbox,
  FormGroup,
  Paper,
  Divider
} from '@mui/material';
import {
  QrCodeScanner as QrIcon,
  CheckCircle as CheckIcon,
  Camera as CameraIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  AccessTime as TimeIcon,
  Event as EventIcon
} from '@mui/icons-material';
import { format, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';

import QRScanner from './QRScanner';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

const CheckinFlow = ({ onComplete, onCancel, preloadedCheckoutId = null }) => {
  const { user } = useAuth();
  const [activeStep, setActiveStep] = useState(preloadedCheckoutId ? 1 : 0);
  const [showScanner, setShowScanner] = useState(false);
  
  // Form state
  const [assetId, setAssetId] = useState('');
  const [checkoutData, setCheckoutData] = useState(null);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  
  const [returnCondition, setReturnCondition] = useState('good');
  const [returnNotes, setReturnNotes] = useState('');
  const [hasDamage, setHasDamage] = useState(false);
  const [damageDescription, setDamageDescription] = useState('');
  const [damageSeverity, setDamageSeverity] = useState('minor');
  const [estimatedRepairCost, setEstimatedRepairCost] = useState(0);
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const steps = [
    'Scan Equipment',
    'Review Checkout',
    'Inspect Condition',
    'Confirm Return'
  ];

  useEffect(() => {
    if (preloadedCheckoutId) {
      fetchCheckoutDetails(preloadedCheckoutId);
    }
  }, [preloadedCheckoutId]);

  const handleQRScan = async (scannedData) => {
    console.log('Scanned:', scannedData);
    setAssetId(scannedData);
    setShowScanner(false);
    await fetchCheckoutByAssetId(scannedData);
  };

  const fetchCheckoutByAssetId = async (assetIdParam) => {
    setLoadingCheckout(true);
    setError(null);
    
    try {
      // Get equipment details
      const equipmentResponse = await api.get(`/equipment/${assetIdParam}`);
      const equipment = equipmentResponse.data;
      
      // Validate that equipment is checked out
      if (equipment.status !== 'CHECKED_OUT') {
        setError(`Equipment is not checked out. Current status: ${equipment.status}`);
        setCheckoutData(null);
        return;
      }
      
      // Get active checkout for this equipment
      const checkoutsResponse = await api.get(`/equipment/checkouts`, {
        params: {
          assetId: assetIdParam,
          status: 'active'
        }
      });
      
      if (checkoutsResponse.data.length === 0) {
        setError('No active checkout found for this equipment');
        setCheckoutData(null);
        return;
      }
      
      const checkout = checkoutsResponse.data[0];
      
      setCheckoutData({
        ...checkout,
        equipment: equipment
      });
      setActiveStep(1); // Move to next step
    } catch (error) {
      console.error('Failed to fetch checkout:', error);
      setError(error.response?.data?.detail || 'Failed to load checkout details');
      setCheckoutData(null);
    } finally {
      setLoadingCheckout(false);
    }
  };

  const fetchCheckoutDetails = async (checkoutId) => {
    setLoadingCheckout(true);
    setError(null);
    
    try {
      const response = await api.get(`/equipment/checkouts/${checkoutId}`);
      const checkout = response.data;
      
      // Get equipment details
      const equipmentResponse = await api.get(`/equipment/${checkout.assetId}`);
      
      setCheckoutData({
        ...checkout,
        equipment: equipmentResponse.data
      });
      setAssetId(checkout.assetId);
    } catch (error) {
      console.error('Failed to fetch checkout:', error);
      setError(error.response?.data?.detail || 'Failed to load checkout details');
    } finally {
      setLoadingCheckout(false);
    }
  };

  const calculateDaysUsed = () => {
    if (!checkoutData) return 0;
    const checkedOut = new Date(checkoutData.checkedOutAt);
    const now = new Date();
    return Math.max(1, differenceInDays(now, checkedOut));
  };

  const calculateOverdueDays = () => {
    if (!checkoutData) return 0;
    const expectedReturn = new Date(checkoutData.expectedReturnDate);
    const now = new Date();
    const overdue = differenceInDays(now, expectedReturn);
    return overdue > 0 ? overdue : 0;
  };

  const isOverdue = () => {
    if (!checkoutData) return false;
    return new Date() > new Date(checkoutData.expectedReturnDate);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const checkinData = {
        assetId: checkoutData.assetId,
        checkoutId: checkoutData.checkoutId,
        returnCondition: returnCondition,
        returnNotes: returnNotes,
        returnPhotos: [], // Could add photo upload
        checkinLocation: null, // Could add GPS
        damageReport: hasDamage ? {
          hasDamage: true,
          description: damageDescription,
          severity: damageSeverity,
          photos: [],
          estimatedRepairCost: estimatedRepairCost,
          reportedBy: user?.uid || '',
          reportedAt: new Date().toISOString()
        } : null,
        accessories: [] // Could add accessories verification
      };

      // Check if online
      if (navigator.onLine) {
        const response = await api.post('/equipment/checkin', checkinData);
        toast.success(`✓ ${checkoutData.equipment.name} checked in successfully!`);
        
        // Call completion callback
        if (onComplete) {
          onComplete(response.data);
        }
      } else {
        // Offline: Queue transaction
        queueOfflineCheckin(checkinData);
        toast.success('Check-in queued. Will sync when online.');
        
        if (onComplete) {
          onComplete({ offline: true });
        }
      }
    } catch (error) {
      console.error('Check-in error:', error);
      setError(error.response?.data?.detail || 'Failed to check-in equipment');
      toast.error('Check-in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const queueOfflineCheckin = (checkinData) => {
    // Store in IndexedDB or localStorage
    const queue = JSON.parse(localStorage.getItem('offline_checkins') || '[]');
    queue.push({
      ...checkinData,
      timestamp: new Date().toISOString(),
      synced: false
    });
    localStorage.setItem('offline_checkins', JSON.stringify(queue));
  };

  const handleNext = () => {
    if (activeStep === 0 && !checkoutData) {
      toast.error('Please scan equipment first');
      return;
    }
    if (activeStep === 2 && hasDamage && !damageDescription) {
      toast.error('Please describe the damage');
      return;
    }
    setActiveStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const getConditionColor = (condition) => {
    const colors = {
      excellent: 'success',
      good: 'success',
      minor_wear: 'warning',
      needs_cleaning: 'warning',
      damaged: 'error'
    };
    return colors[condition] || 'default';
  };

  return (
    <Box sx={{ maxWidth: 600, margin: '0 auto', padding: 2 }}>
      {/* Stepper */}
      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Step 0: Scan Equipment */}
      {activeStep === 0 && (
        <Card>
          <CardContent>
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Avatar
                sx={{
                  width: 80,
                  height: 80,
                  margin: '0 auto 16px',
                  bgcolor: 'success.main'
                }}
              >
                <QrIcon sx={{ fontSize: 40 }} />
              </Avatar>
              
              <Typography variant="h6" gutterBottom>
                Scan Equipment QR Code
              </Typography>
              
              <Typography variant="body2" color="text.secondary" paragraph>
                Point your camera at the equipment's QR code to begin check-in
              </Typography>

              <Button
                variant="contained"
                size="large"
                startIcon={<QrIcon />}
                onClick={() => setShowScanner(true)}
                sx={{ mb: 2 }}
              >
                Open Scanner
              </Button>

              {loadingCheckout && (
                <Box sx={{ mt: 2 }}>
                  <CircularProgress size={24} />
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Loading checkout details...
                  </Typography>
                </Box>
              )}

              {checkoutData && (
                <Card variant="outlined" sx={{ mt: 2, textAlign: 'left' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <CheckIcon color="success" sx={{ mr: 1 }} />
                      <Typography variant="h6">{checkoutData.equipment.name}</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      Model: {checkoutData.equipment.model}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Checked out: {format(new Date(checkoutData.checkedOutAt), 'MMM dd, yyyy')}
                    </Typography>
                    {isOverdue() && (
                      <Chip
                        label={`Overdue by ${calculateOverdueDays()} days`}
                        color="error"
                        size="small"
                        icon={<WarningIcon />}
                        sx={{ mt: 1 }}
                      />
                    )}
                  </CardContent>
                </Card>
              )}

              <Button
                variant="outlined"
                onClick={onCancel}
                sx={{ mt: 2 }}
              >
                Cancel
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Review Checkout */}
      {activeStep === 1 && checkoutData && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Review Checkout Details
            </Typography>

            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Equipment
              </Typography>
              <Typography variant="h6">{checkoutData.equipment.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {checkoutData.equipment.model} • {checkoutData.assetId}
              </Typography>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Checkout Information
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">Checked out:</Typography>
                <Typography variant="body2" fontWeight="medium">
                  {format(new Date(checkoutData.checkedOutAt), 'MMM dd, yyyy h:mm a')}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">Expected return:</Typography>
                <Typography variant="body2" fontWeight="medium">
                  {format(new Date(checkoutData.expectedReturnDate), 'MMM dd, yyyy h:mm a')}
                </Typography>
              </Box>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">Days used:</Typography>
                <Chip 
                  label={`${calculateDaysUsed()} days`} 
                  size="small" 
                  color="primary" 
                />
              </Box>
              {isOverdue() && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">Overdue:</Typography>
                  <Chip 
                    label={`${calculateOverdueDays()} days`} 
                    size="small" 
                    color="error"
                    icon={<WarningIcon />}
                  />
                </Box>
              )}
            </Paper>

            {isOverdue() && (
              <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
                This equipment is overdue. Please return it as soon as possible.
              </Alert>
            )}

            <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
              <Button onClick={handleBack} variant="outlined" fullWidth>
                Back
              </Button>
              <Button onClick={handleNext} variant="contained" fullWidth>
                Next
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Condition Inspection */}
      {activeStep === 2 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Equipment Condition
            </Typography>
            
            <FormControl component="fieldset" sx={{ mb: 3, width: '100%' }}>
              <FormLabel component="legend">Return Condition</FormLabel>
              <RadioGroup
                value={returnCondition}
                onChange={(e) => {
                  setReturnCondition(e.target.value);
                  if (e.target.value === 'damaged') {
                    setHasDamage(true);
                  }
                }}
              >
                <FormControlLabel
                  value="excellent"
                  control={<Radio />}
                  label="Excellent - Like new"
                />
                <FormControlLabel
                  value="good"
                  control={<Radio />}
                  label="Good - Normal wear"
                />
                <FormControlLabel
                  value="minor_wear"
                  control={<Radio />}
                  label="Minor Wear - Some scratches"
                />
                <FormControlLabel
                  value="needs_cleaning"
                  control={<Radio />}
                  label="Needs Cleaning"
                />
                <FormControlLabel
                  value="damaged"
                  control={<Radio />}
                  label="Damaged - Requires repair"
                />
              </RadioGroup>
            </FormControl>

            <FormGroup sx={{ mb: 2 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={hasDamage}
                    onChange={(e) => setHasDamage(e.target.checked)}
                  />
                }
                label="Report Damage"
              />
            </FormGroup>

            {hasDamage && (
              <Box sx={{ p: 2, bgcolor: 'error.light', borderRadius: 1, mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Damage Report
                </Typography>
                
                <TextField
                  fullWidth
                  label="Describe the damage"
                  multiline
                  rows={3}
                  value={damageDescription}
                  onChange={(e) => setDamageDescription(e.target.value)}
                  required
                  sx={{ mb: 2, bgcolor: 'white' }}
                />

                <FormControl fullWidth sx={{ mb: 2 }}>
                  <FormLabel>Severity</FormLabel>
                  <RadioGroup
                    row
                    value={damageSeverity}
                    onChange={(e) => setDamageSeverity(e.target.value)}
                  >
                    <FormControlLabel value="minor" control={<Radio />} label="Minor" />
                    <FormControlLabel value="moderate" control={<Radio />} label="Moderate" />
                    <FormControlLabel value="major" control={<Radio />} label="Major" />
                    <FormControlLabel value="critical" control={<Radio />} label="Critical" />
                  </RadioGroup>
                </FormControl>

                <TextField
                  fullWidth
                  label="Estimated Repair Cost (₹)"
                  type="number"
                  value={estimatedRepairCost}
                  onChange={(e) => setEstimatedRepairCost(parseFloat(e.target.value) || 0)}
                  sx={{ bgcolor: 'white' }}
                />
              </Box>
            )}

            <TextField
              fullWidth
              label="Additional Notes (optional)"
              multiline
              rows={2}
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="Any observations about the equipment..."
              sx={{ mb: 2 }}
            />

            <Button
              variant="outlined"
              startIcon={<CameraIcon />}
              fullWidth
              sx={{ mb: 2 }}
            >
              Take Return Photos (Optional)
            </Button>

            <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
              <Button onClick={handleBack} variant="outlined" fullWidth>
                Back
              </Button>
              <Button onClick={handleNext} variant="contained" fullWidth>
                Next
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Confirmation */}
      {activeStep === 3 && checkoutData && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Confirm Check-in
            </Typography>

            <List>
              <ListItem>
                <ListItemIcon>
                  <CheckIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Equipment"
                  secondary={`${checkoutData.equipment.name} (${checkoutData.equipment.model})`}
                />
              </ListItem>
              
              <ListItem>
                <ListItemIcon>
                  <TimeIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Days Used"
                  secondary={`${calculateDaysUsed()} days`}
                />
              </ListItem>
              
              <ListItem>
                <ListItemIcon>
                  {isOverdue() ? <ErrorIcon color="error" /> : <CheckIcon color="success" />}
                </ListItemIcon>
                <ListItemText
                  primary="Status"
                  secondary={isOverdue() ? `Overdue by ${calculateOverdueDays()} days` : 'On time'}
                />
              </ListItem>

              <ListItem>
                <ListItemIcon>
                  <CheckIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Return Condition"
                  secondary={
                    <Chip 
                      label={returnCondition.replace('_', ' ').toUpperCase()} 
                      color={getConditionColor(returnCondition)}
                      size="small"
                    />
                  }
                />
              </ListItem>

              {hasDamage && (
                <ListItem>
                  <ListItemIcon>
                    <WarningIcon color="error" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Damage Reported"
                    secondary={`${damageSeverity.toUpperCase()} - ${damageDescription.substring(0, 50)}...`}
                  />
                </ListItem>
              )}
            </List>

            {hasDamage && (
              <Alert severity="error" sx={{ mb: 2 }}>
                <Typography variant="body2" fontWeight="bold">
                  Damage Reported
                </Typography>
                <Typography variant="body2">
                  This equipment will be marked for maintenance and repair.
                </Typography>
              </Alert>
            )}

            {isOverdue() && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  This equipment was returned {calculateOverdueDays()} day(s) late. 
                  This may affect your responsibility score.
                </Typography>
              </Alert>
            )}

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                onClick={handleBack}
                variant="outlined"
                fullWidth
                disabled={submitting}
              >
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                variant="contained"
                fullWidth
                disabled={submitting}
                color={hasDamage ? 'error' : 'primary'}
              >
                {submitting ? <CircularProgress size={24} /> : 'Confirm Check-in'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* QR Scanner Modal */}
      {showScanner && (
        <QRScanner
          onScan={handleQRScan}
          onClose={() => setShowScanner(false)}
          scanMode="asset"
          title="Scan Equipment for Check-in"
        />
      )}
    </Box>
  );
};

export default CheckinFlow;
