/**
 * Equipment Checkout Flow
 * Mobile-optimized multi-step form for checking out equipment
 * 
 * Features:
 * - QR code scanning
 * - Asset validation
 * - Event selection
 * - Expected return date
 * - Condition inspection
 * - Offline support with queue
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormLabel,
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
  ListItemIcon
} from '@mui/material';
import {
  QrCodeScanner as QrIcon,
  Event as EventIcon,
  CalendarToday as CalendarIcon,
  CheckCircle as CheckIcon,
  Camera as CameraIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { format, addDays } from 'date-fns';
import toast from 'react-hot-toast';

import QRScanner from './QRScanner';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

const CheckoutFlow = ({ onComplete, onCancel }) => {
  const { user } = useAuth();
  const [activeStep, setActiveStep] = useState(0);
  const [showScanner, setShowScanner] = useState(false);
  
  // Form state
  const [assetId, setAssetId] = useState('');
  const [assetData, setAssetData] = useState(null);
  const [loadingAsset, setLoadingAsset] = useState(false);
  
  const [expectedReturnDate, setExpectedReturnDate] = useState(addDays(new Date(), 3));
  const [checkoutNotes, setCheckoutNotes] = useState('');
  
  const [condition, setCondition] = useState('good');
  const [checkoutPhotos, setCheckoutPhotos] = useState([]);
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const steps = [
    'Scan Equipment',
    'Return Date',
    'Inspection',
    'Confirm'
  ];

  // Removed events fetching - not needed

  const handleQRScan = async (scannedData) => {
    console.log('Scanned:', scannedData);
    setAssetId(scannedData);
    setShowScanner(false);
    await fetchAssetDetails(scannedData);
  };

  const fetchAssetDetails = async (id) => {
    setLoadingAsset(true);
    setError(null);
    
    try {
      const response = await api.get(`/equipment/${id}`);
      const asset = response.data;
      
      // Validate status
      if (asset.status !== 'AVAILABLE') {
        setError(`Equipment not available. Current status: ${asset.status}`);
        setAssetData(null);
        return;
      }
      
      setAssetData(asset);
      setActiveStep(1); // Move to next step
      
      // Set default return date to 3 days from now
      setExpectedReturnDate(addDays(new Date(), 3));
    } catch (error) {
      console.error('Failed to fetch asset:', error);
      setError(error.response?.data?.detail || 'Failed to load equipment details');
      setAssetData(null);
    } finally {
      setLoadingAsset(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    // Validate user is logged in
    if (!user || !user.uid) {
      setError('You must be logged in to checkout equipment');
      toast.error('Please log in first');
      setSubmitting(false);
      return;
    }

    try {
      const checkoutData = {
        assetId: assetId,
        uid: user.uid, // Use uid from Firebase Auth user
        checkoutType: 'internal_event', // Changed from 'internal_use' to match backend enum
        eventId: null, // Not required for teammate checkouts
        expectedReturnDate: expectedReturnDate.toISOString(),
        checkoutCondition: condition,
        checkoutNotes: checkoutNotes,
        checkoutLocation: null, // Could add GPS here
        accessories: [] // Could add accessories selection
      };

      // Check if online
      if (navigator.onLine) {
        const response = await api.post('/equipment/checkout', checkoutData);
        toast.success(`✓ ${assetData.name} checked out successfully!`);
        
        // Call completion callback
        if (onComplete) {
          onComplete(response.data);
        }
      } else {
        // Offline: Queue transaction
        queueOfflineCheckout(checkoutData);
        toast.success('Checkout queued. Will sync when online.');
        
        if (onComplete) {
          onComplete({ offline: true });
        }
      }
    } catch (error) {
      console.error('Checkout error:', error);
      
      // Handle validation errors (422)
      if (error.response?.status === 422 && error.response?.data?.detail) {
        const validationErrors = error.response.data.detail;
        
        if (Array.isArray(validationErrors)) {
          // Show each validation error
          const errorMessages = validationErrors.map(err => {
            const field = err.loc?.[1] || 'unknown';
            const message = err.msg || 'Invalid value';
            return `${field}: ${message}`;
          }).join('; ');
          setError(errorMessages);
          toast.error('Validation error: ' + errorMessages);
        } else if (typeof validationErrors === 'string') {
          setError(validationErrors);
          toast.error(validationErrors);
        } else {
          setError('Validation failed. Please check your input.');
          toast.error('Validation failed. Please check your input.');
        }
      } else {
        const errorMessage = error.response?.data?.detail || 'Failed to checkout equipment';
        setError(errorMessage);
        toast.error('Checkout failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const queueOfflineCheckout = (checkoutData) => {
    // Store in IndexedDB or localStorage
    const queue = JSON.parse(localStorage.getItem('offline_checkouts') || '[]');
    queue.push({
      ...checkoutData,
      timestamp: new Date().toISOString(),
      synced: false
    });
    localStorage.setItem('offline_checkouts', JSON.stringify(queue));
  };

  const handleNext = () => {
    if (activeStep === 0 && !assetData) {
      toast.error('Please scan equipment first');
      return;
    }
    if (activeStep === 1 && !expectedReturnDate) {
      toast.error('Please select expected return date');
      return;
    }
    setActiveStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const getStatusColor = (status) => {
    const colors = {
      AVAILABLE: 'success',
      CHECKED_OUT: 'info',
      MAINTENANCE: 'warning',
      MISSING: 'error',
      RETIRED: 'default'
    };
    return colors[status] || 'default';
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
                  bgcolor: 'primary.main'
                }}
              >
                <QrIcon sx={{ fontSize: 40 }} />
              </Avatar>
              
              <Typography variant="h6" gutterBottom>
                Scan Equipment QR Code
              </Typography>
              
              <Typography variant="body2" color="text.secondary" paragraph>
                Point your camera at the equipment's QR code
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

              {loadingAsset && (
                <Box sx={{ mt: 2 }}>
                  <CircularProgress size={24} />
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Loading equipment details...
                  </Typography>
                </Box>
              )}

              {assetData && (
                <Card variant="outlined" sx={{ mt: 2, textAlign: 'left' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <CheckIcon color="success" sx={{ mr: 1 }} />
                      <Typography variant="h6">{assetData.name}</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      Model: {assetData.model}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Category: {assetData.category}
                    </Typography>
                    <Chip
                      label={assetData.status}
                      color={getStatusColor(assetData.status)}
                      size="small"
                      sx={{ mt: 1 }}
                    />
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

      {/* Step 1: Return Date */}
      {activeStep === 1 && (
        <Card>
          <CardContent>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Avatar
                sx={{
                  width: 60,
                  height: 60,
                  margin: '0 auto 16px',
                  bgcolor: 'primary.main'
                }}
              >
                <CalendarIcon />
              </Avatar>
              
              <Typography variant="h6" gutterBottom>
                Expected Return Date
              </Typography>
              
              <Typography variant="body2" color="text.secondary">
                When do you plan to return this equipment?
              </Typography>
            </Box>

            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                label="Expected Return Date"
                value={expectedReturnDate}
                onChange={(newValue) => setExpectedReturnDate(newValue)}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    sx: { mb: 2 }
                  }
                }}
                minDate={new Date()}
              />
            </LocalizationProvider>

            <TextField
              fullWidth
              label="Notes (optional)"
              multiline
              rows={3}
              value={checkoutNotes}
              onChange={(e) => setCheckoutNotes(e.target.value)}
              placeholder="Any special instructions or notes..."
              sx={{ mb: 3 }}
            />

            <Box sx={{ display: 'flex', gap: 2 }}>
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
            
            <FormControl component="fieldset" sx={{ mb: 3 }}>
              <FormLabel component="legend">Current Condition</FormLabel>
              <RadioGroup
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
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
              </RadioGroup>
            </FormControl>

            <Button
              variant="outlined"
              startIcon={<CameraIcon />}
              fullWidth
              sx={{ mb: 2 }}
            >
              Take Checkout Photos (Optional)
            </Button>

            <Alert severity="info" icon={<WarningIcon />}>
              You are responsible for this equipment. Report any damage immediately.
            </Alert>

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
      {activeStep === 3 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Confirm Checkout
            </Typography>

            <List>
              <ListItem>
                <ListItemIcon>
                  <CheckIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Equipment"
                  secondary={`${assetData?.name} (${assetData?.model})`}
                />
              </ListItem>
              
              <ListItem>
                <ListItemIcon>
                  <CalendarIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Return By"
                  secondary={format(expectedReturnDate, 'MMMM dd, yyyy')}
                />
              </ListItem>

              <ListItem>
                <ListItemIcon>
                  <CheckIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Condition"
                  secondary={condition.replace('_', ' ').toUpperCase()}
                />
              </ListItem>
            </List>

            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2" fontWeight="bold">
                Important Reminders:
              </Typography>
              <Typography variant="body2" component="ul" sx={{ pl: 2, mt: 1 }}>
                <li>Return equipment on or before the due date</li>
                <li>Report any damage immediately</li>
                <li>Keep equipment clean and in good condition</li>
                <li>Late returns may incur charges</li>
              </Typography>
            </Alert>

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
              >
                {submitting ? <CircularProgress size={24} /> : 'Confirm Checkout'}
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
          title="Scan Equipment"
        />
      )}
    </Box>
  );
};

export default CheckoutFlow;
