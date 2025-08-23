import React, { useState, useEffect, useCallback } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Grid,
    Typography,
    Box,
    Card,
    CardContent,
    List,
    ListItem,
    Divider,
    Avatar,
    Chip,
    FormControlLabel,
    Switch,
    Alert,
    CircularProgress
} from '@mui/material';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

const InvoiceReplyModal = ({ 
    open, 
    onClose, 
    invoice = null, 
    onSendReply,
    onLoadThread 
}) => {
    const [loading, setLoading] = useState(false);
    const [threadLoading, setThreadLoading] = useState(false);
    const [thread, setThread] = useState([]);
    const [formData, setFormData] = useState({
        message: '',
        sendEmail: true
    });

    const loadThread = useCallback(async () => {
        if (!invoice?.id || !onLoadThread) return;
        
        setThreadLoading(true);
        try {
            const threadData = await onLoadThread(invoice.id);
            setThread(threadData || []);
        } catch (error) {
            console.error('Error loading thread:', error);
            setThread([]);
        } finally {
            setThreadLoading(false);
        }
    }, [invoice?.id, onLoadThread]);

    useEffect(() => {
        if (invoice && open) {
            setFormData({
                message: '',
                sendEmail: true
            });
            loadThread();
        }
    }, [invoice, open, loadThread]);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSendReply = async () => {
        if (!formData.message.trim()) {
            return;
        }

        setLoading(true);
        try {
            await onSendReply({
                invoiceId: invoice.id,
                message: formData.message.trim(),
                sendEmail: formData.sendEmail
            });
            
            // Reload thread after sending
            await loadThread();
            
            // Clear form
            setFormData({
                message: '',
                sendEmail: true
            });
        } catch (error) {
            console.error('Error sending reply:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDateTime = (dateString) => {
        try {
            return format(new Date(dateString), 'MMM dd, yyyy hh:mm a');
        } catch (error) {
            return 'Invalid date';
        }
    };

    const getMessageTypeColor = (type) => {
        switch (type) {
            case 'INVOICE_SENT':
                return 'primary';
            case 'PAYMENT_REMINDER':
                return 'warning';
            case 'PAYMENT_RECEIVED':
                return 'success';
            case 'CLIENT_REPLY':
                return 'info';
            case 'INTERNAL_NOTE':
                return 'default';
            default:
                return 'default';
        }
    };

    const getMessageTypeLabel = (type) => {
        switch (type) {
            case 'INVOICE_SENT':
                return 'Invoice Sent';
            case 'PAYMENT_REMINDER':
                return 'Payment Reminder';
            case 'PAYMENT_RECEIVED':
                return 'Payment Received';
            case 'CLIENT_REPLY':
                return 'Client Reply';
            case 'INTERNAL_NOTE':
                return 'Internal Note';
            default:
                return type || 'Message';
        }
    };

    if (!invoice) {
        return null;
    }

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                Invoice Communication - {invoice.number}
            </DialogTitle>
            <DialogContent>
                <Grid container spacing={3}>
                    {/* Invoice Summary */}
                    <Grid item xs={12}>
                        <Card variant="outlined">
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Invoice Summary
                                </Typography>
                                <Grid container spacing={2}>
                                    <Grid item xs={6}>
                                        <Typography variant="body2" color="text.secondary">
                                            Client:
                                        </Typography>
                                        <Typography variant="body1">
                                            {invoice.client?.name || 'Unknown Client'}
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Typography variant="body2" color="text.secondary">
                                            Status:
                                        </Typography>
                                        <Chip 
                                            label={invoice.status} 
                                            color={
                                                invoice.status === 'PAID' ? 'success' :
                                                invoice.status === 'OVERDUE' ? 'error' :
                                                invoice.status === 'PARTIAL' ? 'warning' : 'default'
                                            }
                                            size="small"
                                        />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Typography variant="body2" color="text.secondary">
                                            Amount Due:
                                        </Typography>
                                        <Typography variant="body1" color="primary">
                                            {new Intl.NumberFormat('en-IN', {
                                                style: 'currency',
                                                currency: invoice.currency || 'INR',
                                                minimumFractionDigits: 0,
                                                maximumFractionDigits: 0
                                            }).format(invoice.totals?.amountDue || 0)}
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Typography variant="body2" color="text.secondary">
                                            Due Date:
                                        </Typography>
                                        <Typography variant="body1">
                                            {invoice.dueDate ? format(new Date(invoice.dueDate), 'MMM dd, yyyy') : 'Not set'}
                                        </Typography>
                                    </Grid>
                                </Grid>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Communication Thread */}
                    <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom>
                            Communication History
                        </Typography>
                        
                        {threadLoading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                <CircularProgress />
                            </Box>
                        ) : (
                            <Card variant="outlined" sx={{ maxHeight: 400, overflow: 'auto' }}>
                                {thread.length === 0 ? (
                                    <CardContent>
                                        <Typography variant="body2" color="text.secondary" align="center">
                                            No communication history found
                                        </Typography>
                                    </CardContent>
                                ) : (
                                    <List>
                                        {thread.map((message, index) => (
                                            <React.Fragment key={message.id || index}>
                                                <ListItem alignItems="flex-start">
                                                    <Box sx={{ display: 'flex', width: '100%', gap: 2 }}>
                                                        <Avatar sx={{ width: 32, height: 32, fontSize: '0.875rem' }}>
                                                            {message.type === 'CLIENT_REPLY' ? 'C' : 'S'}
                                                        </Avatar>
                                                        <Box sx={{ flexGrow: 1 }}>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                                                <Typography variant="subtitle2">
                                                                    {message.type === 'CLIENT_REPLY' ? 
                                                                        (invoice.client?.name || 'Client') : 
                                                                        (message.sentBy || 'System')
                                                                    }
                                                                </Typography>
                                                                <Chip 
                                                                    label={getMessageTypeLabel(message.type)} 
                                                                    color={getMessageTypeColor(message.type)}
                                                                    size="small"
                                                                />
                                                                <Typography variant="caption" color="text.secondary">
                                                                    {formatDateTime(message.sentAt)}
                                                                </Typography>
                                                            </Box>
                                                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                                                {message.message}
                                                            </Typography>
                                                        </Box>
                                                    </Box>
                                                </ListItem>
                                                {index < thread.length - 1 && <Divider variant="inset" component="li" />}
                                            </React.Fragment>
                                        ))}
                                    </List>
                                )}
                            </Card>
                        )}
                    </Grid>

                    {/* New Reply */}
                    <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom>
                            Send New Message
                        </Typography>
                    </Grid>

                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            label="Message"
                            multiline
                            rows={4}
                            value={formData.message}
                            onChange={(e) => handleInputChange('message', e.target.value)}
                            placeholder="Type your message to the client..."
                            helperText="This message will be added to the communication thread"
                        />
                    </Grid>

                    <Grid item xs={12}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={formData.sendEmail}
                                    onChange={(e) => handleInputChange('sendEmail', e.target.checked)}
                                />
                            }
                            label="Send email notification to client"
                        />
                    </Grid>

                    {!formData.message.trim() && (
                        <Grid item xs={12}>
                            <Alert severity="info">
                                Enter a message to send to the client
                            </Alert>
                        </Grid>
                    )}
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={loading}>
                    Close
                </Button>
                <Button 
                    onClick={handleSendReply}
                    variant="contained" 
                    disabled={loading || !formData.message.trim()}
                    color="primary"
                >
                    {loading ? 'Sending...' : 'Send Message'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default InvoiceReplyModal;
