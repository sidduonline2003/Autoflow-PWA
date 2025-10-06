import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    List,
    ListItem,
    ListItemText,
    Paper,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { POSTPROD_ENABLED } from '../config';
import AdminLayout from '../components/layout/AdminLayout';

const DashboardPage = () => {
    const { user, claims } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const theme = useTheme();

    const [findOpen, setFindOpen] = useState(false);
    const [findTerm, setFindTerm] = useState('');
    const [events, setEvents] = useState([]);
    const [loadingEvents, setLoadingEvents] = useState(false);

    const featurePostprod = POSTPROD_ENABLED !== false;
    const roleValue = (claims?.role || '').toLowerCase();
    const canLoadEvents = featurePostprod && ['admin', 'accountant', 'teammate'].includes(roleValue);

    const displayName = user?.displayName || user?.email || 'Admin User';
    const firstName = useMemo(() => (displayName || '').split(' ')[0] || 'Admin', [displayName]);

    const filteredEvents = useMemo(() => {
        const term = findTerm.trim().toLowerCase();
        if (!term) {
            return events;
        }
        return events.filter((evt) => (evt?.eventName || '').toLowerCase().includes(term));
    }, [events, findTerm]);

    const openPostProd = useCallback(
        (evt) => {
            if (!evt?.id) {
                return;
            }
            navigate(`/events/${evt.id}/postprod`);
            setFindOpen(false);
        },
        [navigate],
    );

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        setFindOpen(params.get('finder') === 'true');
    }, [location.search]);

    const handleOpenFinder = useCallback(() => {
        navigate('/dashboard?finder=true');
    }, [navigate]);

    const handleCloseFinder = useCallback(() => {
        setFindOpen(false);
        const params = new URLSearchParams(location.search);
        if (params.has('finder')) {
            params.delete('finder');
            navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true });
        }
    }, [location.pathname, location.search, navigate]);

    useEffect(() => {
        if (!canLoadEvents) {
            return;
        }

        let cancelled = false;

        (async () => {
            try {
                setLoadingEvents(true);
                const idToken = await user?.getIdToken?.();
                if (!idToken || cancelled) {
                    return;
                }
                const response = await fetch('/api/events/', {
                    headers: { Authorization: `Bearer ${idToken}` },
                });
                if (!response.ok || cancelled) {
                    return;
                }
                const payload = await response.json();
                if (!cancelled) {
                    const normalized = Array.isArray(payload) ? payload : payload?.events || [];
                    setEvents(normalized);
                }
            } catch (error) {
                console.error('Failed to load events', error);
            } finally {
                if (!cancelled) {
                    setLoadingEvents(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [canLoadEvents, user]);

    const quickCards = useMemo(
        () => [
            {
                id: 'ops',
                tag: 'Operations',
                title: 'Teammate readiness',
                description: 'Monitor availability and coverage before assigning new crews.',
                path: '/attendance',
                actionLabel: 'Open Attendance',
                icon: AccessTimeIcon,
            },
            {
                id: 'finance',
                tag: 'Finance',
                title: 'Invoices & receivables',
                description: 'Confirm receipts and accelerate outstanding invoices.',
                path: '/accounts-receivable',
                actionLabel: 'View Receivables',
                icon: AccountBalanceWalletIcon,
            },
            {
                id: 'quality',
                tag: 'Quality',
                title: 'Receipt verification queue',
                description: 'Spot anomalies early by reviewing recent submissions.',
                path: '/receipts',
                actionLabel: 'Audit Receipts',
                icon: ReceiptLongIcon,
            },
        ],
        [],
    );

    const appBarActions = (
        <Button
            startIcon={<SearchIcon />}
            variant="outlined"
            onClick={handleOpenFinder}
            disabled={loadingEvents && !events.length}
        >
            Find Event
        </Button>
    );

    return (
        <AdminLayout disableContainer appBarActions={appBarActions}>
            <Container maxWidth="xl" sx={{ py: { xs: 4, md: 5 } }}>
                <Stack spacing={4}>
                    <Paper
                        elevation={0}
                        sx={{
                            p: { xs: 3, md: 4 },
                            borderRadius: 4,
                            backgroundImage: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
                            color: theme.palette.primary.contrastText,
                            position: 'relative',
                            overflow: 'hidden',
                            boxShadow: '0 35px 60px rgba(17, 24, 39, 0.25)',
                        }}
                    >
                        <Stack spacing={2}>
                            <Typography variant="h4" fontWeight={700}>
                                Welcome back, {firstName}.
                            </Typography>
                            <Typography variant="body1" sx={{ maxWidth: 520, opacity: 0.9 }}>
                                Stay ahead of every production track with realtime insights across teams, finances, and post-production.
                            </Typography>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                <Button variant="contained" color="secondary" onClick={() => navigate('/team')}>
                                    Review Team Health
                                </Button>
                                <Button variant="outlined" color="inherit" onClick={() => navigate('/financial')}>
                                    View Financial Hub
                                </Button>
                                <Button
                                    startIcon={<SearchIcon />}
                                    variant="contained"
                                    color="info"
                                    onClick={handleOpenFinder}
                                    sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
                                    disabled={loadingEvents && !events.length}
                                >
                                    Find Event
                                </Button>
                            </Stack>
                        </Stack>
                    </Paper>

                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                        {quickCards.map((card) => {
                            const Icon = card.icon;
                            return (
                                <Paper
                                    key={card.id}
                                    variant="outlined"
                                    sx={{
                                        flex: 1,
                                        p: 3,
                                        borderRadius: 3,
                                        minHeight: 180,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        backgroundColor: alpha(theme.palette.common.white, 0.9),
                                        backdropFilter: 'blur(14px)',
                                        boxShadow: '0 20px 35px rgba(15, 23, 42, 0.08)',
                                        transition: theme.transitions.create(['transform', 'box-shadow'], {
                                            duration: theme.transitions.duration.shorter,
                                        }),
                                        '&:hover': {
                                            transform: 'translateY(-6px)',
                                            boxShadow: '0 24px 45px rgba(15, 23, 42, 0.12)',
                                        },
                                    }}
                                >
                                    <Stack spacing={1.5}>
                                        <Chip
                                            label={card.tag}
                                            size="small"
                                            sx={{
                                                alignSelf: 'flex-start',
                                                backgroundColor: alpha(theme.palette.primary.main, 0.12),
                                                color: theme.palette.primary.main,
                                                fontWeight: 600,
                                            }}
                                        />
                                        <Stack direction="row" spacing={1.5} alignItems="center">
                                            <Box
                                                sx={{
                                                    width: 36,
                                                    height: 36,
                                                    borderRadius: 1.5,
                                                    display: 'grid',
                                                    placeItems: 'center',
                                                    backgroundColor: alpha(theme.palette.primary.main, 0.16),
                                                    color: theme.palette.primary.main,
                                                }}
                                            >
                                                <Icon fontSize="small" />
                                            </Box>
                                            <Typography variant="h6">{card.title}</Typography>
                                        </Stack>
                                        <Typography variant="body2" color="text.secondary">
                                            {card.description}
                                        </Typography>
                                    </Stack>
                                    <Button
                                        size="small"
                                        onClick={() => navigate(card.path)}
                                        sx={{ mt: 2, alignSelf: 'flex-start' }}
                                    >
                                        {card.actionLabel}
                                    </Button>
                                </Paper>
                            );
                        })}
                    </Stack>

                    {claims && (
                        <Paper
                            variant="outlined"
                            sx={{
                                p: 3,
                                borderRadius: 3,
                                backgroundColor: alpha(theme.palette.common.white, 0.92),
                                backdropFilter: 'blur(12px)',
                            }}
                        >
                            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                                Identity Snapshot
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Custom Firebase claims currently applied to your session.
                            </Typography>
                            <Box
                                component="pre"
                                sx={{
                                    m: 0,
                                    fontFamily: 'Fira Code, monospace',
                                    fontSize: 13,
                                    p: 2,
                                    borderRadius: 2,
                                    bgcolor: alpha(theme.palette.primary.light, 0.16),
                                    color: theme.palette.grey[800],
                                    overflowX: 'auto',
                                }}
                            >
                                {JSON.stringify(claims, null, 2)}
                            </Box>
                        </Paper>
                    )}
                </Stack>
            </Container>

            <Dialog open={findOpen} onClose={handleCloseFinder} maxWidth="md" fullWidth>
                <DialogTitle>Find Event by Name</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        label="Search by event name (e.g., TEST2)"
                        value={findTerm}
                        onChange={(event) => setFindTerm(event.target.value)}
                        sx={{ my: 1 }}
                    />
                    <Box sx={{ minHeight: 220, position: 'relative' }}>
                        {loadingEvents && (
                            <Stack
                                direction="row"
                                spacing={1.5}
                                alignItems="center"
                                justifyContent="center"
                                sx={{ py: 4 }}
                            >
                                <CircularProgress size={24} />
                                <Typography variant="body2" color="text.secondary">
                                    Loading events…
                                </Typography>
                            </Stack>
                        )}
                        {!loadingEvents && filteredEvents.length === 0 && (
                            <Typography sx={{ p: 2 }} color="text.secondary">
                                No events match that name.
                            </Typography>
                        )}
                        <List sx={{ maxHeight: 360, overflow: 'auto' }}>
                            {filteredEvents.map((evt) => (
                                <ListItem
                                    key={evt.id}
                                    divider
                                    secondaryAction={
                                        featurePostprod ? (
                                            <Button size="small" variant="contained" onClick={() => openPostProd(evt)}>
                                                Open Post-Production
                                            </Button>
                                        ) : null
                                    }
                                >
                                    <ListItemText
                                        primary={evt.eventName || 'Untitled Event'}
                                        secondary={
                                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                                <Chip label={`Date: ${evt.date || 'N/A'}`} size="small" />
                                                <Chip label={`Time: ${evt.time || 'N/A'}`} size="small" />
                                                <Chip label={`Venue: ${evt.venue || 'N/A'}`} size="small" />
                                                <Chip label={`Status: ${evt.status || 'UPCOMING'}`} size="small" color="info" />
                                                {evt.clientId && <Chip label={`Client: ${evt.clientId}`} size="small" />}
                                            </Stack>
                                        }
                                    />
                                </ListItem>
                            ))}
                        </List>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseFinder}>Close</Button>
                </DialogActions>
            </Dialog>
        </AdminLayout>
    );
};

export default DashboardPage;
