import React, { useState } from 'react';
import {
    Box, TextField, Grid, Button, Typography, Alert
} from '@mui/material';

const CreateSalaryRunForm = ({ onSubmit }) => {
    const [formData, setFormData] = useState({
        month: new Date().getMonth() + 1, // Current month
        year: new Date().getFullYear(), // Current year
        remarks: ''
    });
    
    const [error, setError] = useState('');
    
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: name === 'month' || name === 'year' ? parseInt(value, 10) : value
        });
    };
    
    const handleSubmit = (e) => {
        e.preventDefault();
        
        // Validate
        if (!formData.month || !formData.year) {
            setError('Month and year are required');
            return;
        }
        
        if (formData.month < 1 || formData.month > 12) {
            setError('Month must be between 1 and 12');
            return;
        }
        
        if (formData.year < 2000 || formData.year > 2100) {
            setError('Please enter a valid year');
            return;
        }
        
        // Clear any previous errors and submit
        setError('');
        onSubmit(formData);
    };
    
    // Generate month options
    const months = [
        { value: 1, label: 'January' },
        { value: 2, label: 'February' },
        { value: 3, label: 'March' },
        { value: 4, label: 'April' },
        { value: 5, label: 'May' },
        { value: 6, label: 'June' },
        { value: 7, label: 'July' },
        { value: 8, label: 'August' },
        { value: 9, label: 'September' },
        { value: 10, label: 'October' },
        { value: 11, label: 'November' },
        { value: 12, label: 'December' }
    ];
    
    return (
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            
            <Typography variant="body2" color="text.secondary" paragraph>
                Create a new salary run for a specific month. This will generate draft payslips for all active team members.
            </Typography>
            
            <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                    <TextField
                        select
                        label="Month"
                        name="month"
                        value={formData.month}
                        onChange={handleChange}
                        fullWidth
                        required
                        SelectProps={{
                            native: true
                        }}
                    >
                        {months.map((month) => (
                            <option key={month.value} value={month.value}>
                                {month.label}
                            </option>
                        ))}
                    </TextField>
                </Grid>
                <Grid item xs={12} sm={6}>
                    <TextField
                        label="Year"
                        name="year"
                        type="number"
                        value={formData.year}
                        onChange={handleChange}
                        fullWidth
                        required
                        InputProps={{ inputProps: { min: 2000, max: 2100 } }}
                    />
                </Grid>
                <Grid item xs={12}>
                    <TextField
                        label="Remarks"
                        name="remarks"
                        value={formData.remarks}
                        onChange={handleChange}
                        fullWidth
                        multiline
                        rows={2}
                        placeholder="Any notes about this salary run (optional)"
                    />
                </Grid>
                <Grid item xs={12}>
                    <Button
                        type="submit"
                        variant="contained"
                        fullWidth
                    >
                        Create Salary Run
                    </Button>
                </Grid>
            </Grid>
        </Box>
    );
};

export default CreateSalaryRunForm;
