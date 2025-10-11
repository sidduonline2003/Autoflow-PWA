import React, { useState } from 'react';
import {
    Box,
    Container,
    Typography,
    Paper,
    Button,
    Alert,
    Card,
    CardContent,
} from '@mui/material';
import {
    QrCodeScanner as QrCodeScannerIcon,
    ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import QRScanner from '../../components/equipment/QRScanner';

const QRScannerPage = () => {
    const navigate = useNavigate();
    const [showScanner, setShowScanner] = useState(false);
    const [scannedData, setScannedData] = useState(null);

    const handleScan = (data) => {
        setScannedData(data);
        setShowScanner(false);

        // Check if it's an asset code
        if (data.startsWith('ASSET_')) {
            // Navigate to equipment details or show quick actions
            navigate(`/equipment/${data}`);
        } else if (data.startsWith('LOC_')) {
            // Location code - show equipment at this location
            navigate(`/equipment?location=${data}`);
        }
    };

    const handleClose = () => {
        setShowScanner(false);
    };

    return (
        <AdminLayout
            appBarTitle="QR Scanner"
            pageTitle="Equipment QR Scanner"
            pageSubtitle="Scan equipment QR codes to view details or perform actions"
        >
            <Paper sx={{ p: 4, textAlign: 'center' }}>
                {!showScanner ? (
                    <>
                        <QrCodeScannerIcon sx={{ fontSize: 80, color: 'primary.main', mb: 2 }} />
                        <Typography variant="h5" gutterBottom>
                            Ready to Scan
                        </Typography>
                        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                            Click the button below to open your camera and scan equipment QR codes
                        </Typography>
                        <Button
                            variant="contained"
                            size="large"
                            startIcon={<QrCodeScannerIcon />}
                            onClick={() => setShowScanner(true)}
                        >
                            Open Camera
                        </Button>

                        {scannedData && (
                            <Alert severity="success" sx={{ mt: 3 }}>
                                Last scanned: <strong>{scannedData}</strong>
                            </Alert>
                        )}

                        <Card sx={{ mt: 4, textAlign: 'left' }}>
                            <CardContent>
                                <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                                    Quick Tips:
                                </Typography>
                                <ul>
                                    <li>
                                        <Typography variant="body2">
                                            Point your camera at the QR code on the equipment
                                        </Typography>
                                    </li>
                                    <li>
                                        <Typography variant="body2">
                                            Make sure the QR code is well-lit and in focus
                                        </Typography>
                                    </li>
                                    <li>
                                        <Typography variant="body2">
                                            You can also enter the code manually if scanning fails
                                        </Typography>
                                    </li>
                                    <li>
                                        <Typography variant="body2">
                                            Works with both equipment (ASSET_xxx) and location (LOC_xxx) codes
                                        </Typography>
                                    </li>
                                </ul>
                            </CardContent>
                        </Card>
                    </>
                ) : (
                    <Box>
                        <QRScanner
                            onScan={handleScan}
                            onClose={handleClose}
                            scanMode="asset"
                            title="Scan Equipment QR Code"
                        />
                    </Box>
                )}
            </Paper>

            <Alert severity="info" sx={{ mt: 3 }}>
                <Typography variant="body2">
                    <strong>Note:</strong> The QR Scanner component is integrated. Make sure your backend API
                    is running to fetch equipment details after scanning. API endpoint:{' '}
                    <code>GET /api/equipment/&#123;assetId&#125;</code>
                </Typography>
            </Alert>
        </AdminLayout>
    );
};

export default QRScannerPage;
