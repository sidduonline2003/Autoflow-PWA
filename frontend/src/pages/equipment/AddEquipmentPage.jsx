import React, { useState } from 'react';
import {
    Box,
    Typography,
    Paper,
    Button,
    TextField,
    Grid,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    InputAdornment,
    Alert,
    CircularProgress,
    Card,
    CardContent,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    Save as SaveIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import { equipmentAPI } from '../../services/equipmentApi';
import toast from 'react-hot-toast';

const AddEquipmentPage = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        category: '',
        manufacturer: '',
        model: '',
        serialNumber: '',
        purchaseDate: new Date().toISOString().split('T')[0],
        purchasePrice: '',
        currentValue: '',
        condition: 'EXCELLENT',
        location: '',
        notes: '',
    });

    const [errors, setErrors] = useState({});

    const categories = [
        { value: 'camera', label: 'Camera' },
        { value: 'lens', label: 'Lens' },
        { value: 'lighting', label: 'Lighting' },
        { value: 'audio', label: 'Audio' },
        { value: 'grip', label: 'Grip & Support' },
        { value: 'drone', label: 'Drone' },
        { value: 'misc', label: 'Miscellaneous' },
    ];

    const conditions = [
        { value: 'EXCELLENT', label: 'Excellent' },
        { value: 'GOOD', label: 'Good' },
        { value: 'MINOR_WEAR', label: 'Minor Wear' },
        { value: 'NEEDS_CLEANING', label: 'Needs Cleaning' },
        { value: 'DAMAGED', label: 'Damaged' },
    ];

    const handleChange = (field) => (event) => {
        setFormData({
            ...formData,
            [field]: event.target.value,
        });
        // Clear error for this field
        if (errors[field]) {
            setErrors({
                ...errors,
                [field]: null,
            });
        }
    };

    const validate = () => {
        const newErrors = {};

        if (!formData.name.trim()) {
            newErrors.name = 'Equipment name is required';
        }
        if (!formData.category) {
            newErrors.category = 'Category is required';
        }
        if (!formData.manufacturer.trim()) {
            newErrors.manufacturer = 'Manufacturer is required';
        }
        if (!formData.model.trim()) {
            newErrors.model = 'Model is required';
        }
        if (!formData.location.trim()) {
            newErrors.location = 'Home location is required';
        }
        if (!formData.purchaseDate) {
            newErrors.purchaseDate = 'Purchase date is required';
        }
        if (!formData.purchasePrice || parseFloat(formData.purchasePrice) <= 0) {
            newErrors.purchasePrice = 'Valid purchase price is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validate()) {
            toast.error('Please fix the errors in the form');
            return;
        }

        setLoading(true);

        try {
            const payload = {
                name: formData.name.trim(),
                category: formData.category,
                manufacturer: formData.manufacturer.trim(),
                model: formData.model.trim(),
                serialNumber: formData.serialNumber.trim() || null,
                description: formData.notes.trim() || null,
                purchaseDate: formData.purchaseDate,
                purchasePrice: parseFloat(formData.purchasePrice),
                dailyRentalRate: formData.currentValue ? parseFloat(formData.currentValue) : 0,
                homeLocation: formData.location.trim(),
                photos: [],
                maintenanceIntervalDays: 30,
                tags: [],
                requiresApproval: false,
            };

            const response = await equipmentAPI.create(payload);

            toast.success(`Equipment created successfully! Asset ID: ${response.data.assetId}`);
            
            // Show QR code if available
            if (response.data.qrCodeUrl) {
                setQrCodeUrl(response.data.qrCodeUrl);
            }

            // Redirect after 2 seconds
            setTimeout(() => {
                navigate('/equipment');
            }, 2000);
        } catch (error) {
            console.error('Error creating equipment:', error);
            
            // Handle validation errors (422)
            if (error.response?.status === 422 && error.response?.data?.detail) {
                const validationErrors = error.response.data.detail;
                
                if (Array.isArray(validationErrors)) {
                    // Show each validation error
                    validationErrors.forEach(err => {
                        const field = err.loc?.[1] || 'unknown';
                        const message = err.msg || 'Invalid value';
                        toast.error(`${field}: ${message}`);
                    });
                } else {
                    toast.error(validationErrors);
                }
            } else {
                const errorMessage = error.response?.data?.detail || 'Failed to create equipment';
                toast.error(errorMessage);
            }
        } finally {
            setLoading(false);
        }
    };

    if (qrCodeUrl) {
        return (
            <AdminLayout
                appBarTitle="Equipment Created"
                pageTitle="Success!"
            >
                <Card>
                    <CardContent sx={{ textAlign: 'center', py: 6 }}>
                        <Alert severity="success" sx={{ mb: 3 }}>
                            Equipment created successfully!
                        </Alert>

                        <Typography variant="h6" gutterBottom>
                            {formData.name}
                        </Typography>

                        <Box sx={{ my: 4 }}>
                            <img
                                src={qrCodeUrl}
                                alt="Equipment QR Code"
                                style={{ maxWidth: '300px', border: '1px solid #ddd', padding: '16px' }}
                            />
                        </Box>

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                            Scan this QR code to quickly access this equipment
                        </Typography>

                        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                            <Button
                                variant="outlined"
                                onClick={() => window.print()}
                            >
                                Print QR Code
                            </Button>
                            <Button
                                variant="contained"
                                onClick={() => navigate('/equipment')}
                            >
                                View All Equipment
                            </Button>
                        </Box>
                    </CardContent>
                </Card>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            appBarTitle="Add Equipment"
            pageTitle="Add New Equipment"
            pageSubtitle="Create a new equipment asset in your inventory"
        >
            <Paper sx={{ p: 4 }}>
                <form onSubmit={handleSubmit}>
                    <Grid container spacing={3}>
                        {/* Basic Information */}
                        <Grid item xs={12}>
                            <Typography variant="h6" gutterBottom>
                                Basic Information
                            </Typography>
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                required
                                label="Equipment Name"
                                value={formData.name}
                                onChange={handleChange('name')}
                                error={!!errors.name}
                                helperText={errors.name || 'e.g., Sony A7S III'}
                                placeholder="Enter equipment name"
                            />
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth required error={!!errors.category}>
                                <InputLabel>Category</InputLabel>
                                <Select
                                    value={formData.category}
                                    onChange={handleChange('category')}
                                    label="Category"
                                >
                                    {categories.map((cat) => (
                                        <MenuItem key={cat.value} value={cat.value}>
                                            {cat.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                required
                                label="Manufacturer"
                                value={formData.manufacturer}
                                onChange={handleChange('manufacturer')}
                                error={!!errors.manufacturer}
                                helperText={errors.manufacturer}
                                placeholder="e.g., Sony"
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                required
                                label="Model"
                                value={formData.model}
                                onChange={handleChange('model')}
                                error={!!errors.model}
                                helperText={errors.model}
                                placeholder="e.g., A7S III"
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="Serial Number"
                                value={formData.serialNumber}
                                onChange={handleChange('serialNumber')}
                                placeholder="e.g., SN12345678"
                            />
                        </Grid>

                        {/* Financial Information */}
                        <Grid item xs={12}>
                            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                                Financial Information
                            </Typography>
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                required
                                type="date"
                                label="Purchase Date"
                                value={formData.purchaseDate}
                                onChange={handleChange('purchaseDate')}
                                error={!!errors.purchaseDate}
                                helperText={errors.purchaseDate}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                required
                                type="number"
                                label="Purchase Price"
                                value={formData.purchasePrice}
                                onChange={handleChange('purchasePrice')}
                                error={!!errors.purchasePrice}
                                helperText={errors.purchasePrice}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                                }}
                                placeholder="0.00"
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                type="number"
                                label="Daily Rental Rate (Optional)"
                                value={formData.currentValue}
                                onChange={handleChange('currentValue')}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                                }}
                                placeholder="0.00"
                                helperText="Leave blank if not available for rent"
                            />
                        </Grid>

                        {/* Status & Location */}
                        <Grid item xs={12}>
                            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                                Status & Location
                            </Typography>
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth>
                                <InputLabel>Condition</InputLabel>
                                <Select
                                    value={formData.condition}
                                    onChange={handleChange('condition')}
                                    label="Condition"
                                >
                                    {conditions.map((cond) => (
                                        <MenuItem key={cond.value} value={cond.value}>
                                            {cond.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                required
                                label="Home Location"
                                value={formData.location}
                                onChange={handleChange('location')}
                                error={!!errors.location}
                                helperText={errors.location || 'e.g., Main Studio, Storage Room A'}
                                placeholder="Enter storage location"
                            />
                        </Grid>

                        {/* Notes */}
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                multiline
                                rows={3}
                                label="Notes"
                                value={formData.notes}
                                onChange={handleChange('notes')}
                                placeholder="Add any additional notes about this equipment..."
                            />
                        </Grid>

                        {/* Actions */}
                        <Grid item xs={12}>
                            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
                                <Button
                                    variant="outlined"
                                    startIcon={<ArrowBackIcon />}
                                    onClick={() => navigate('/equipment')}
                                    disabled={loading}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    variant="contained"
                                    startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
                                    disabled={loading}
                                >
                                    {loading ? 'Creating...' : 'Create Equipment'}
                                </Button>
                            </Box>
                        </Grid>
                    </Grid>
                </form>
            </Paper>

            <Alert severity="info" sx={{ mt: 3 }}>
                <Typography variant="body2">
                    <strong>Note:</strong> A unique Asset ID and QR code will be automatically generated when you
                    create this equipment. The QR code can be printed and attached to the physical equipment for
                    easy scanning.
                </Typography>
            </Alert>
        </AdminLayout>
    );
};

export default AddEquipmentPage;
