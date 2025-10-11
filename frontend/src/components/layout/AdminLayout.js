import React, { useCallback, useMemo, useState } from 'react';
import {
    AppBar,
    Avatar,
    Box,
    Container,
    Divider,
    Drawer,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    ListSubheader,
    Paper,
    Stack,
    Toolbar,
    Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import GroupIcon from '@mui/icons-material/Group';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import MovieFilterIcon from '@mui/icons-material/MovieFilter';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import SearchIcon from '@mui/icons-material/Search';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import InventoryIcon from '@mui/icons-material/Inventory';
import BuildIcon from '@mui/icons-material/Build';
import BarChartIcon from '@mui/icons-material/BarChart';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../firebase';
import { signOut } from 'firebase/auth';
import { POSTPROD_ENABLED } from '../../config';

const drawerWidth = 280;

const AdminLayout = ({
    children,
    appBarTitle = 'Admin Control Center',
    pageTitle,
    pageSubtitle,
    actions,
    appBarActions,
    disableContainer = false,
    containerProps,
    maxWidth = 'xl',
    contentPadding = { xs: 4, md: 5 },
    backgroundImage = 'linear-gradient(180deg, #86EFFF 24.02%, #FFFFFF 100%)',
}) => {
    const { user, claims } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));

    const [mobileOpen, setMobileOpen] = useState(false);

    const displayName = user?.displayName || user?.email || 'Admin User';
    const roleValue = (claims?.role || '').toLowerCase();
    const featurePostprod = POSTPROD_ENABLED !== false;
    const isAdmin = roleValue === 'admin';

    const userInitials = useMemo(() => {
        if (!displayName) {
            return 'AD';
        }
        const parts = displayName.trim().split(' ').filter(Boolean);
        if (!parts.length) {
            return 'AD';
        }
        return parts
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() || '')
            .join('') || 'AD';
    }, [displayName]);

    const formattedRole = useMemo(() => {
        if (!roleValue) {
            return 'Administrator';
        }
        return roleValue
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase()
            .replace(/(^|\s)\w/g, (match) => match.toUpperCase());
    }, [roleValue]);

    const navSections = useMemo(() => {
        const base = [
            {
                title: 'Navigation',
                items: [
                    { label: 'Overview', icon: DashboardIcon, path: '/dashboard' },
                    { label: 'Team Management', icon: GroupIcon, path: '/team' },
                    { label: 'Client Hub', icon: BusinessCenterIcon, path: '/clients' },
                    { label: 'Live Attendance', icon: AccessTimeIcon, path: '/attendance' },
                    { label: 'Receipt Verification', icon: ReceiptLongIcon, path: '/receipts' },
                    { label: 'Financial Hub', icon: AccountBalanceIcon, path: '/financial' },
                    { label: 'Accounts Receivable', icon: AccountBalanceWalletIcon, path: '/accounts-receivable' },
                ],
            },
        ];

        if (featurePostprod) {
            const postProdItems = [
                { label: 'My Assignments', icon: AssignmentTurnedInIcon, path: '/my-assignments' },
                { label: 'My Work', icon: WorkOutlineIcon, path: '/my-work' },
            ];
            if (isAdmin) {
                postProdItems.push({ label: 'Post Production Hub', icon: MovieFilterIcon, path: '/postprod' });
            }
            base.push({
                title: 'Post-Production',
                items: postProdItems,
            });
        }

        // Equipment Inventory Module
        base.push({
            title: 'Equipment Tracking',
            items: [
                { label: 'Equipment Dashboard', icon: InventoryIcon, path: '/equipment' },
                { label: 'QR Scanner', icon: QrCodeScannerIcon, path: '/equipment/scan' },
                { label: 'Maintenance', icon: BuildIcon, path: '/equipment/maintenance' },
                { label: 'Analytics', icon: BarChartIcon, path: '/equipment/analytics' },
            ],
        });

        base.push({
            title: 'Shortcuts',
            items: [{ label: 'Event Finder', icon: SearchIcon, path: '/dashboard?finder=true', action: 'finder' }],
        });

        base.push({
            title: 'Administration',
            items: [{ label: 'Admin Settings', icon: SettingsIcon, path: '/settings' }],
        });

        return base;
    }, [featurePostprod, isAdmin]);

    const handleDrawerToggle = useCallback(() => {
        setMobileOpen((prev) => !prev);
    }, []);

    const closeDrawerOnMobile = useCallback(() => {
        if (!isDesktop) {
            setMobileOpen(false);
        }
    }, [isDesktop]);

    const handleLogout = useCallback(async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Failed to log out', error);
        } finally {
            closeDrawerOnMobile();
        }
    }, [closeDrawerOnMobile]);

    const isActiveRoute = useCallback(
        (path) => {
            if (!path) {
                return false;
            }
            const currentPath = location.pathname;
            if (path === '/dashboard') {
                return currentPath === '/' || currentPath === '/dashboard';
            }
            return currentPath === path || currentPath.startsWith(`${path}/`);
        },
        [location.pathname],
    );

    const handleNavItemClick = useCallback(
        (item) => {
            if (!item) {
                return;
            }

            if (item.path) {
                navigate(item.path);
                closeDrawerOnMobile();
            }
        },
        [closeDrawerOnMobile, navigate],
    );

    const drawerContent = (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                backgroundColor: alpha(theme.palette.common.white, 0.82),
                backdropFilter: 'blur(16px)',
            }}
        >
            <Toolbar sx={{ px: 3 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box
                        sx={{
                            width: 44,
                            height: 44,
                            borderRadius: 3,
                            display: 'grid',
                            placeItems: 'center',
                            backgroundImage: `linear-gradient(135deg, ${theme.palette.primary.light}, ${theme.palette.primary.main})`,
                            color: theme.palette.primary.contrastText,
                            boxShadow: '0 12px 30px rgba(17, 24, 39, 0.18)',
                        }}
                    >
                        <AutoAwesomeIcon fontSize="small" />
                    </Box>
                    <Box>
                        <Typography variant="subtitle2" color="text.secondary">
                            Autoflow
                        </Typography>
                        <Typography variant="h6" fontWeight={700}>
                            Admin Suite
                        </Typography>
                    </Box>
                </Stack>
            </Toolbar>
            <Divider />
            <Box sx={{ flexGrow: 1, overflowY: 'auto', py: 1 }}>
                {navSections.map((section) => (
                    <List
                        key={section.title}
                        dense
                        disablePadding
                        subheader={
                            <ListSubheader
                                component="div"
                                disableSticky
                                sx={{ px: 3, py: 1.5, fontWeight: 600, color: 'text.secondary' }}
                            >
                                {section.title}
                            </ListSubheader>
                        }
                    >
                        {section.items.map((item) => {
                            const Icon = item.icon;
                            return (
                                <ListItem key={item.label} disablePadding sx={{ px: 1.5, pb: 0.4 }}>
                                    <ListItemButton
                                        onClick={() => handleNavItemClick(item)}
                                        selected={item.path ? isActiveRoute(item.path) : false}
                                        sx={{
                                            borderRadius: 2.5,
                                            minHeight: 46,
                                            px: 2,
                                            transition: theme.transitions.create(['background-color', 'transform'], {
                                                duration: theme.transitions.duration.shorter,
                                            }),
                                            ...(item.action === 'finder' && {
                                                border: `1px dashed ${alpha(theme.palette.primary.main, 0.3)}`,
                                            }),
                                            '&:hover': {
                                                transform: 'translateX(4px)',
                                                backgroundColor: alpha(theme.palette.primary.main, 0.08),
                                            },
                                            '&.Mui-selected': {
                                                backgroundImage: `linear-gradient(135deg, ${alpha(
                                                    theme.palette.primary.main,
                                                    0.18,
                                                )}, ${alpha(theme.palette.primary.main, 0.26)})`,
                                                color: theme.palette.primary.main,
                                                '& .MuiListItemIcon-root': {
                                                    color: theme.palette.primary.main,
                                                },
                                            },
                                        }}
                                    >
                                        <ListItemIcon sx={{ minWidth: 38, color: 'text.secondary' }}>
                                            <Icon fontSize="small" />
                                        </ListItemIcon>
                                        <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 500 }} />
                                    </ListItemButton>
                                </ListItem>
                            );
                        })}
                    </List>
                ))}
            </Box>
            <Divider />
            <Box sx={{ p: 3, pt: 2 }}>
                <Paper
                    elevation={0}
                    sx={{
                        p: 2.5,
                        borderRadius: 3,
                        backgroundColor: alpha(theme.palette.primary.light, 0.15),
                        border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}`,
                    }}
                >
                    <Typography variant="subtitle2" gutterBottom>
                        Playbook Tip
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Keep teammates synchronized by reviewing attendance and receipts each morning before allocating new codes.
                    </Typography>
                </Paper>
                <List dense sx={{ mt: 1 }}>
                    <ListItem disablePadding>
                        <ListItemButton onClick={handleLogout} sx={{ borderRadius: 2 }}>
                            <ListItemIcon sx={{ minWidth: 38, color: 'error.main' }}>
                                <LogoutIcon fontSize="small" />
                            </ListItemIcon>
                            <ListItemText primary="Logout" primaryTypographyProps={{ fontWeight: 500 }} />
                        </ListItemButton>
                    </ListItem>
                </List>
            </Box>
        </Box>
    );

    const renderContent = () => {
        if (disableContainer) {
            return children;
        }

        const { sx: containerSx, ...restContainerProps } = containerProps || {};

        return (
            <Container
                maxWidth={maxWidth}
                sx={{ py: contentPadding, ...containerSx }}
                {...restContainerProps}
            >
                {(pageTitle || pageSubtitle || actions) && (
                    <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        spacing={2}
                        alignItems={{ xs: 'flex-start', md: 'center' }}
                        justifyContent="space-between"
                        sx={{ mb: 3 }}
                    >
                        <Box>
                            {pageTitle && (
                                <Typography variant="h4" fontWeight={700} gutterBottom>
                                    {pageTitle}
                                </Typography>
                            )}
                            {pageSubtitle && (
                                <Typography variant="body1" color="text.secondary">
                                    {pageSubtitle}
                                </Typography>
                            )}
                        </Box>
                        {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>}
                    </Stack>
                )}
                {children}
            </Container>
        );
    };

    return (
        <Box
            sx={{
                display: 'flex',
                minHeight: '100vh',
                backgroundImage,
            }}
        >
            <AppBar
                position="fixed"
                color="transparent"
                elevation={0}
                sx={{
                    borderBottom: '1px solid',
                    borderColor: alpha(theme.palette.common.black, 0.08),
                    width: { lg: `calc(100% - ${drawerWidth}px)` },
                    ml: { lg: `${drawerWidth}px` },
                    backdropFilter: 'blur(18px)',
                }}
            >
                <Toolbar sx={{ minHeight: 74 }}>
                    {!isDesktop && (
                        <IconButton edge="start" color="inherit" onClick={handleDrawerToggle} sx={{ mr: 2 }}>
                            <MenuIcon />
                        </IconButton>
                    )}
                    <Typography variant="h6" fontWeight={600}>
                        {appBarTitle}
                    </Typography>
                    <Box sx={{ flexGrow: 1 }} />
                    {appBarActions && <Box sx={{ display: { xs: 'none', sm: 'inline-flex' }, mr: 2 }}>{appBarActions}</Box>}
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <Avatar
                            sx={{
                                bgcolor: theme.palette.primary.main,
                                color: theme.palette.primary.contrastText,
                                width: 42,
                                height: 42,
                                fontWeight: 600,
                            }}
                        >
                            {userInitials}
                        </Avatar>
                        <Box sx={{ textAlign: 'left' }}>
                            <Typography variant="subtitle1" fontWeight={600} noWrap>
                                {displayName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                                {formattedRole}
                            </Typography>
                        </Box>
                    </Stack>
                </Toolbar>
            </AppBar>
            <Drawer
                variant={isDesktop ? 'permanent' : 'temporary'}
                open={isDesktop ? true : mobileOpen}
                onClose={handleDrawerToggle}
                ModalProps={{ keepMounted: true }}
                sx={{
                    '& .MuiDrawer-paper': {
                        width: drawerWidth,
                        boxSizing: 'border-box',
                        borderRight: 'none',
                        boxShadow: isDesktop ? '8px 0 24px rgba(17, 24, 39, 0.08)' : 'none',
                        backgroundColor: 'transparent',
                    },
                }}
            >
                {drawerContent}
            </Drawer>
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    width: { lg: `calc(100% - ${drawerWidth}px)` },
                    ml: { lg: `${drawerWidth}px` },
                }}
            >
                <Toolbar sx={{ minHeight: 74 }} />
                {renderContent()}
            </Box>
        </Box>
    );
};

export default AdminLayout;
