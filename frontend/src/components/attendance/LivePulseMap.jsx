import React, { useEffect, useRef, useState, memo, useCallback, useMemo } from 'react';
import { Box, Typography, Paper, CircularProgress, Skeleton, Chip, IconButton, Tooltip, Fade, Avatar, List, ListItem, ListItemAvatar, ListItemText, Divider, Badge } from '@mui/material';
import { renderToString } from 'react-dom/server';
import { 
    Person as PersonIcon, 
    LocationOn as LocationOnIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
    AccessTime as AccessTimeIcon,
    ZoomIn as ZoomInIcon,
    ZoomOut as ZoomOutIcon,
    MyLocation as MyLocationIcon,
    Layers as LayersIcon,
    Event as EventIcon,
    Place as PlaceIcon,
    FiberManualRecord as DotIcon
} from '@mui/icons-material';

// Import OlaMaps SDK (npm package)
// Also available via CDN: https://www.unpkg.com/olamaps-web-sdk@latest/dist/olamaps-web-sdk.umd.js
import { OlaMaps } from 'olamaps-web-sdk';

const OLA_MAPS_API_KEY = process.env.REACT_APP_OLA_MAPS_API_KEY || '';

// Styles for the pulsing animation
const pulseStyles = `
    @keyframes pulse-green {
        0% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7); }
        70% { box-shadow: 0 0 0 10px rgba(76, 175, 80, 0); }
        100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
    }
    @keyframes pulse-amber {
        0% { box-shadow: 0 0 0 0 rgba(255, 152, 0, 0.7); }
        70% { box-shadow: 0 0 0 10px rgba(255, 152, 0, 0); }
        100% { box-shadow: 0 0 0 0 rgba(255, 152, 0, 0); }
    }
    @keyframes pulse-red {
        0% { box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.7); }
        70% { box-shadow: 0 0 0 10px rgba(244, 67, 54, 0); }
        100% { box-shadow: 0 0 0 0 rgba(244, 67, 54, 0); }
    }
    .marker-pin {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        border: 2px solid white;
        transition: transform 0.2s;
        cursor: pointer;
    }
    .marker-pin:hover {
        transform: scale(1.2);
        z-index: 999;
    }
    .pulse-green {
        background-color: #2e7d32;
        animation: pulse-green 2s infinite;
    }
    .pulse-amber {
        background-color: #ed6c02;
        animation: pulse-amber 2s infinite;
    }
    .pulse-red {
        background-color: #d32f2f;
        animation: pulse-red 2s infinite;
    }
    .pulse-grey {
        background-color: #64748b;
    }
    
    /* Geofence Circle Style */
    .geofence-circle {
        width: 100px;
        height: 100px;
        border-radius: 50%;
        background-color: rgba(76, 175, 80, 0.15);
        border: 1px solid rgba(76, 175, 80, 0.5);
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
        display: none;
    }
`;

// Memoized map controls component
const MapControls = memo(({ onZoomIn, onZoomOut, onRecenter }) => (
    <Paper 
        sx={{
            position: 'absolute',
            top: 20,
            right: 20,
            zIndex: 1,
            borderRadius: 2,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
        }}
    >
        <Tooltip title="Zoom In" placement="left">
            <IconButton size="small" onClick={onZoomIn} sx={{ borderRadius: 0 }}>
                <ZoomInIcon fontSize="small" />
            </IconButton>
        </Tooltip>
        <Tooltip title="Zoom Out" placement="left">
            <IconButton size="small" onClick={onZoomOut} sx={{ borderRadius: 0, borderTop: '1px solid #e2e8f0' }}>
                <ZoomOutIcon fontSize="small" />
            </IconButton>
        </Tooltip>
        <Tooltip title="Fit All Markers" placement="left">
            <IconButton size="small" onClick={onRecenter} sx={{ borderRadius: 0, borderTop: '1px solid #e2e8f0' }}>
                <MyLocationIcon fontSize="small" />
            </IconButton>
        </Tooltip>
    </Paper>
));

MapControls.displayName = 'MapControls';

// Memoized legend component
const MapLegend = memo(({ eventCount, activeCount, lateCount }) => (
    <Paper sx={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        p: 2,
        zIndex: 1,
        borderRadius: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.97)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        minWidth: 160
    }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b' }}>
                Live Status
            </Typography>
            <Chip 
                size="small" 
                label={`${eventCount} Events`}
                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }}
            />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ 
                        width: 12, 
                        height: 12, 
                        borderRadius: '50%', 
                        bgcolor: '#2e7d32', 
                        boxShadow: '0 0 0 2px rgba(46, 125, 50, 0.2)',
                        animation: 'pulse-green 2s infinite'
                    }} />
                    <Typography variant="caption" fontWeight={500}>On Site</Typography>
                </Box>
                <Typography variant="caption" color="success.main" fontWeight={600}>{activeCount}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ 
                        width: 12, 
                        height: 12, 
                        borderRadius: '50%', 
                        bgcolor: '#ed6c02', 
                        boxShadow: '0 0 0 2px rgba(237, 108, 2, 0.2)' 
                    }} />
                    <Typography variant="caption" fontWeight={500}>Late / Remote</Typography>
                </Box>
                <Typography variant="caption" color="warning.main" fontWeight={600}>{lateCount}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ 
                    width: 12, 
                    height: 12, 
                    borderRadius: '50%', 
                    bgcolor: '#1976d2', 
                    border: '1px dashed #1976d2' 
                }} />
                <Typography variant="caption" fontWeight={500}>Venue Zone (100m)</Typography>
            </Box>
        </Box>
    </Paper>
));

MapLegend.displayName = 'MapLegend';

// Map loading skeleton
const MapSkeleton = () => (
    <Box sx={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center',
        bgcolor: '#f1f5f9', 
        zIndex: 10,
        gap: 2
    }}>
        <Box sx={{ 
            width: 80, 
            height: 80, 
            borderRadius: '50%', 
            bgcolor: '#e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <LayersIcon sx={{ fontSize: 40, color: '#94a3b8' }} />
        </Box>
        <CircularProgress size={24} thickness={4} sx={{ color: '#3b82f6' }} />
        <Typography variant="body2" color="text.secondary" fontWeight={500}>
            Loading Map View...
        </Typography>
    </Box>
);

// Fallback List View when map can't load
const FallbackListView = memo(({ events, onMarkerClick }) => {
    const getStatusColor = (status) => {
        switch(status) {
            case 'checked_in': return 'success';
            case 'checked_in_late': return 'warning';
            case 'checked_in_remote': return 'warning';
            case 'checked_out': return 'info';
            default: return 'default';
        }
    };

    const getStatusLabel = (status) => {
        switch(status) {
            case 'checked_in': return 'On Site';
            case 'checked_in_late': return 'Late';
            case 'checked_in_remote': return 'Remote';
            case 'checked_out': return 'Completed';
            case 'not_checked_in': return 'Pending';
            default: return 'Unknown';
        }
    };

    return (
        <Box sx={{ height: '100%', overflow: 'auto', p: 2 }}>
            {/* Header */}
            <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                mb: 2,
                p: 2,
                bgcolor: '#f8fafc',
                borderRadius: 2,
                border: '1px solid #e2e8f0'
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <PlaceIcon sx={{ color: '#3b82f6' }} />
                    <Typography variant="h6" fontWeight={700} color="#1e293b">
                        Event Locations
                    </Typography>
                </Box>
                <Chip 
                    size="small"
                    label={`${events?.length || 0} Events`}
                    color="primary"
                    variant="outlined"
                />
            </Box>

            {/* Events List */}
            {events?.map((event, idx) => (
                <Paper 
                    key={event.eventId || idx}
                    elevation={0}
                    sx={{ 
                        mb: 2, 
                        p: 2, 
                        borderRadius: 2,
                        border: '1px solid #e2e8f0',
                        '&:hover': { borderColor: '#3b82f6', bgcolor: '#f8fafc' }
                    }}
                >
                    {/* Event Header */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
                        <Box>
                            <Typography variant="subtitle1" fontWeight={700} color="#1e293b">
                                {event.eventName || 'Event'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {event.clientName} • {event.time}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Chip 
                                size="small"
                                label={`${event.checkedIn || 0}/${event.totalAssigned || 0}`}
                                color="success"
                                variant="outlined"
                                sx={{ fontWeight: 600 }}
                            />
                        </Box>
                    </Box>

                    {/* Venue */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, p: 1.5, bgcolor: '#f1f5f9', borderRadius: 1.5 }}>
                        <LocationOnIcon sx={{ color: '#64748b', fontSize: 18 }} />
                        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                            {event.venue || 'Venue not specified'}
                        </Typography>
                    </Box>

                    {/* Team Members */}
                    {event.attendanceRecords?.length > 0 && (
                        <Box>
                            <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                                TEAM MEMBERS
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                {event.attendanceRecords.map((record, i) => (
                                    <Chip
                                        key={i}
                                        avatar={
                                            <Avatar sx={{ 
                                                bgcolor: record.status === 'checked_in' ? 'success.main' : 
                                                         record.status === 'not_checked_in' ? 'grey.400' : 'warning.main',
                                                width: 24,
                                                height: 24
                                            }}>
                                                {record.status === 'checked_in' ? <CheckCircleIcon sx={{ fontSize: 14 }} /> :
                                                 record.status === 'not_checked_in' ? <AccessTimeIcon sx={{ fontSize: 14 }} /> :
                                                 <WarningIcon sx={{ fontSize: 14 }} />}
                                            </Avatar>
                                        }
                                        label={
                                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                                <Typography variant="caption" fontWeight={600}>{record.name || 'Team Member'}</Typography>
                                                <Typography variant="caption" sx={{ fontSize: '0.65rem', opacity: 0.7 }}>
                                                    {getStatusLabel(record.status)}
                                                    {record.distance && ` • ${Math.round(record.distance)}m`}
                                                </Typography>
                                            </Box>
                                        }
                                        variant="outlined"
                                        onClick={() => onMarkerClick && onMarkerClick(record, event)}
                                        sx={{ 
                                            height: 'auto',
                                            py: 0.5,
                                            cursor: 'pointer',
                                            borderColor: record.status === 'checked_in' ? 'success.light' : 
                                                        record.status === 'not_checked_in' ? 'grey.300' : 'warning.light',
                                            '&:hover': { bgcolor: 'action.hover' }
                                        }}
                                    />
                                ))}
                            </Box>
                        </Box>
                    )}
                </Paper>
            ))}

            {/* Empty State */}
            {(!events || events.length === 0) && (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                    <EventIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 2 }} />
                    <Typography variant="body1" color="text.secondary" fontWeight={500}>
                        No events scheduled for today
                    </Typography>
                </Box>
            )}
        </Box>
    );
});

FallbackListView.displayName = 'FallbackListView';

const LivePulseMap = memo(({ events, onMarkerClick }) => {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const olaMapsRef = useRef(null);
    const markersRef = useRef([]);
    const stylesInjectedRef = useRef(false);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapError, setMapError] = useState(false);
    const [sdkReady, setSdkReady] = useState(false);
    const [useFallback, setUseFallback] = useState(false);

    // Initialize OlaMaps SDK instance
    useEffect(() => {
        // Check if API key is configured
        if (!OLA_MAPS_API_KEY || OLA_MAPS_API_KEY === '') {
            console.log('OlaMaps API key not configured, using fallback view');
            setUseFallback(true);
            return;
        }

        try {
            // Initialize OlaMaps with API key (new SDK API)
            olaMapsRef.current = new OlaMaps({
                apiKey: OLA_MAPS_API_KEY
            });
            console.log('OlaMaps SDK initialized successfully');
            setSdkReady(true);
        } catch (error) {
            console.error('Failed to initialize OlaMaps SDK:', error);
            setUseFallback(true);
        }
    }, []);

    // Memoize marker counts for legend
    const markerCounts = useMemo(() => {
        let activeCount = 0;
        let lateCount = 0;
        
        events?.forEach(event => {
            event.attendanceRecords?.forEach(record => {
                if (record.status === 'checked_in') activeCount++;
                else if (record.status === 'checked_in_late' || record.status === 'checked_in_remote') lateCount++;
            });
        });
        
        return { eventCount: events?.length || 0, activeCount, lateCount };
    }, [events]);

    // Parse coordinates helper - memoized
    // Handles multiple venue formats:
    // 1. "Venue Name (lat,lng)" - string with embedded coords
    // 2. event.coordinates = {lat, lng}
    // 3. event.latitude/longitude fields
    const parseCoordinates = useCallback((venue, event = null) => {
        // Try to parse from venue string first: "Name (lat,lng)"
        if (venue && typeof venue === 'string') {
            try {
                const match = venue.match(/\(([^)]+)\)/);
                if (match) {
                    const parts = match[1].split(',').map(s => parseFloat(s.trim()));
                    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                        // Return [lng, lat] for MapLibre/OlaMaps (they use lng,lat order)
                        return [parts[1], parts[0]];
                    }
                }
            } catch (e) {
                console.warn('Failed to parse venue string:', venue);
            }
        }
        
        // Try event.coordinates object
        if (event?.coordinates) {
            const { lat, lng, latitude, longitude } = event.coordinates;
            const finalLat = lat || latitude;
            const finalLng = lng || longitude;
            if (finalLat && finalLng) {
                return [finalLng, finalLat];
            }
        }
        
        // Try event.latitude/longitude directly
        if (event?.latitude && event?.longitude) {
            return [event.longitude, event.latitude];
        }
        
        // Try event.location object
        if (event?.location?.lat && event?.location?.lng) {
            return [event.location.lng, event.location.lat];
        }
        
        return null;
    }, []);

    // Map control handlers
    const handleZoomIn = useCallback(() => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.zoomIn();
        }
    }, []);

    const handleZoomOut = useCallback(() => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.zoomOut();
        }
    }, []);

    const handleRecenter = useCallback(() => {
        if (!mapInstanceRef.current || !olaMapsRef.current || !events?.length) return;
        
        // Collect all coordinates and fit bounds
        const allCoords = [];
        
        events.forEach(event => {
            const coords = parseCoordinates(event.venue, event);
            if (coords) {
                allCoords.push(coords);
            }
            event.attendanceRecords?.forEach(record => {
                if (record.checkInLocation?.latitude) {
                    allCoords.push([record.checkInLocation.longitude, record.checkInLocation.latitude]);
                }
            });
        });
        
        if (allCoords.length > 0) {
            // Calculate bounds manually
            let minLng = allCoords[0][0], maxLng = allCoords[0][0];
            let minLat = allCoords[0][1], maxLat = allCoords[0][1];
            
            allCoords.forEach(([lng, lat]) => {
                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
            });
            
            // Add padding
            const lngPadding = (maxLng - minLng) * 0.1 || 0.01;
            const latPadding = (maxLat - minLat) * 0.1 || 0.01;
            
            mapInstanceRef.current.fitBounds([
                [minLng - lngPadding, minLat - latPadding],
                [maxLng + lngPadding, maxLat + latPadding]
            ], { padding: 50, maxZoom: 16 });
        }
    }, [events, parseCoordinates]);

    // Initialize Map - only once when SDK is ready
    useEffect(() => {
        if (!mapContainerRef.current || mapInstanceRef.current || !sdkReady || !olaMapsRef.current) return;

        try {
            // Inject styles only once
            if (!stylesInjectedRef.current) {
                const styleSheet = document.createElement("style");
                styleSheet.innerText = pulseStyles;
                document.head.appendChild(styleSheet);
                stylesInjectedRef.current = true;
            }

            // Initialize map using new OlaMaps SDK API
            // Docs: https://maps.olakrutrim.com/docs/sdks/web-sdk/setup
            const map = olaMapsRef.current.init({
                container: mapContainerRef.current,
                center: [78.4772, 17.4065], // Default to Hyderabad [lng, lat]
                zoom: 11,
                // Use default-light-standard style (2D) - avoids 3D layer issues
                style: 'https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json'
            });

            map.on('load', () => {
                console.log('OlaMaps map loaded successfully');
                setMapLoaded(true);
                mapInstanceRef.current = map;
                
                // Suppress missing image warnings by providing empty placeholder
                map.on('styleimagemissing', (e) => {
                    // Silently ignore missing style images (ola-mbo, ola-mobility-fastcharger, etc.)
                    // These are optional POI icons in the Ola Maps style
                });
            });

            // Only trigger fallback on critical errors, not style warnings
            map.on('error', (e) => {
                // Log the error but don't fallback for non-critical style issues
                console.warn('Map style warning:', e?.error?.message || e);
                
                // Only fallback for truly fatal errors (connection, auth failures)
                const errorMsg = e?.error?.message || '';
                const isFatalError = 
                    errorMsg.includes('401') || 
                    errorMsg.includes('403') ||
                    errorMsg.includes('Failed to fetch') ||
                    errorMsg.includes('NetworkError');
                
                if (isFatalError) {
                    console.error('Fatal map error, switching to fallback:', errorMsg);
                    setMapError(true);
                    setUseFallback(true);
                }
                // Non-fatal errors like missing layers/images are just logged
            });

        } catch (error) {
            console.error("Error initializing Ola Maps:", error);
            setMapError(true);
            setUseFallback(true);
        }

        return () => {
            markersRef.current.forEach(marker => {
                try { marker.remove(); } catch(e) {}
            });
            markersRef.current = [];
        };
    }, [sdkReady]);

    // Update Markers when data changes - optimized
    useEffect(() => {
        if (!mapLoaded || !mapInstanceRef.current || !olaMapsRef.current) return;
        
        console.log('LivePulseMap: Processing events for markers', {
            eventsCount: events?.length || 0,
            events: events?.slice(0, 3).map(e => ({ name: e.eventName, venue: e.venue, records: e.attendanceRecords?.length }))
        });

        const map = mapInstanceRef.current;

        // Clear existing markers efficiently
        markersRef.current.forEach(marker => {
            try { marker.remove(); } catch(e) {}
        });
        markersRef.current = [];

        const allCoords = [];
        
        // If no events, show demo markers in Hyderabad area
        if (!events || events.length === 0) {
            console.log('LivePulseMap: No events, showing demo markers');
            
            // Demo marker at center (Hyderabad)
            const demoEl = document.createElement('div');
            demoEl.innerHTML = `
                <div style="
                    padding: 8px 12px;
                    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                    color: white;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
                    white-space: nowrap;
                ">
                    📍 No events today
                </div>
            `;
            
            const demoMarker = olaMapsRef.current.addMarker({ element: demoEl })
                .setLngLat([78.4867, 17.385])
                .addTo(map);
            markersRef.current.push(demoMarker);
            return;
        }

        // Process events
        events.forEach(event => {
            const coords = parseCoordinates(event.venue, event);
            console.log('LivePulseMap: Event venue parsing', { 
                eventName: event.eventName, 
                venue: event.venue,
                eventCoords: event.coordinates,
                eventLat: event.latitude,
                eventLng: event.longitude,
                parsedCoords: coords 
            });
            
            // If venue has coordinates, add venue marker
            if (coords) {
                allCoords.push(coords);

                // Create Venue/Geofence Marker using new SDK API
                const el = document.createElement('div');
                el.className = 'geofence-marker';
                el.innerHTML = `
                    <div style="
                        width: 22px; 
                        height: 22px; 
                        background: linear-gradient(135deg, #1976d2 0%, #42a5f5 100%); 
                        border: 2px solid white; 
                        border-radius: 50%;
                        box-shadow: 0 2px 8px rgba(25, 118, 210, 0.4);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    ">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                        </svg>
                    </div>
                    <div style="
                        position: absolute; 
                        top: 50%; 
                        left: 50%; 
                        transform: translate(-50%, -50%); 
                        width: 100px; 
                        height: 100px; 
                        background: rgba(25, 118, 210, 0.08); 
                        border: 1px dashed rgba(25, 118, 210, 0.3);
                        border-radius: 50%;
                        pointer-events: none;
                    "></div>
                `;

                // Use olaMaps.addMarker() method from new SDK
                const marker = olaMapsRef.current.addMarker({
                    element: el,
                    anchor: 'center',
                    offset: [0, 0]
                })
                .setLngLat(coords)
                .addTo(map);
                
                const popupContent = `
                    <div style="padding: 10px; min-width: 180px;">
                        <div style="font-weight: 700; color: #1976d2; font-size: 14px; margin-bottom: 4px;">${event.eventName || 'Event'}</div>
                        <div style="font-size: 12px; color: #64748b; margin-bottom: 8px;">${event.clientName || ''}</div>
                        <div style="display: flex; gap: 8px; font-size: 11px;">
                            <span style="background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px;">${event.checkedIn || 0} In</span>
                            <span style="background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">${event.totalAssigned || 0} Total</span>
                        </div>
                    </div>
                `;
                
                // Add popup using new SDK
                const popup = olaMapsRef.current.addPopup({ offset: [0, -10], closeButton: false })
                    .setHTML(popupContent);
                marker.setPopup(popup);
                markersRef.current.push(marker);
            }

            // ALWAYS process team members with check-in locations (even if venue has no coords)
            // This ensures we show markers for checked-in team members
            console.log('LivePulseMap: Processing team members for event', {
                eventName: event.eventName,
                recordCount: event.attendanceRecords?.length || 0,
                records: event.attendanceRecords?.slice(0, 3).map(r => ({
                    name: r.name,
                    status: r.status,
                    hasLocation: !!r.checkInLocation,
                    location: r.checkInLocation
                }))
            });
            
            event.attendanceRecords?.forEach(record => {
                console.log('LivePulseMap: Team member record', {
                    name: record.name,
                    status: record.status,
                    checkInLocation: record.checkInLocation,
                    hasLat: !!record.checkInLocation?.latitude
                });
                
                if (!record.checkInLocation?.latitude) return;
                
                const userCoords = [record.checkInLocation.longitude, record.checkInLocation.latitude];
                allCoords.push(userCoords);

                let pulseClass = 'pulse-grey';
                let statusIcon = <AccessTimeIcon style={{ fontSize: 16 }} />;
                
                if (record.status === 'checked_in') {
                    pulseClass = 'pulse-green';
                    statusIcon = <CheckCircleIcon style={{ fontSize: 16 }} />;
                } else if (record.status === 'checked_in_late' || record.status === 'checked_in_remote') {
                    pulseClass = 'pulse-amber';
                    statusIcon = <WarningIcon style={{ fontSize: 16 }} />;
                } else if (record.status === 'not_checked_in') {
                    pulseClass = 'pulse-red';
                }

                const userEl = document.createElement('div');
                userEl.className = `marker-pin ${pulseClass}`;
                userEl.innerHTML = renderToString(statusIcon);

                const userMarker = olaMapsRef.current.addMarker({ element: userEl })
                    .setLngLat(userCoords)
                    .addTo(map);

                const userPopupContent = `
                    <div style="padding: 10px; min-width: 160px;">
                        <div style="font-weight: 700; color: #1e293b; font-size: 13px;">${record.name || 'Team Member'}</div>
                        <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">${record.role || 'Crew'}</div>
                        <div style="font-size: 11px; color: ${record.isWithinRange ? '#16a34a' : '#ea580c'}; font-weight: 500;">
                            ${record.isWithinRange ? '✓ Inside Venue' : `📍 ${Math.round(record.distance || 0)}m away`}
                        </div>
                        <div style="font-size: 10px; color: #94a3b8; margin-top: 4px;">
                            ${record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : 'N/A'}
                        </div>
                    </div>
                `;

                const userPopup = olaMapsRef.current.addPopup({ offset: [0, -10], closeButton: false })
                    .setHTML(userPopupContent);
                userMarker.setPopup(userPopup);
                
                userEl.addEventListener('click', () => {
                    if (onMarkerClick) onMarkerClick(record, event);
                });

                markersRef.current.push(userMarker);
            });
        });

        // Fit bounds if we have points
        if (allCoords.length > 0) {
            // Calculate bounds manually
            let minLng = allCoords[0][0], maxLng = allCoords[0][0];
            let minLat = allCoords[0][1], maxLat = allCoords[0][1];
            
            allCoords.forEach(([lng, lat]) => {
                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
            });
            
            // Add padding
            const lngPadding = (maxLng - minLng) * 0.1 || 0.01;
            const latPadding = (maxLat - minLat) * 0.1 || 0.01;
            
            map.fitBounds([
                [minLng - lngPadding, minLat - latPadding],
                [maxLng + lngPadding, maxLat + latPadding]
            ], { padding: 60, maxZoom: 15 });
        }

    }, [mapLoaded, events, onMarkerClick, parseCoordinates]);

    // Show fallback list view if map can't load
    if (useFallback) {
        return (
            <Paper 
                elevation={0} 
                sx={{ 
                    width: '100%', 
                    height: '100%', 
                    minHeight: '600px',
                    borderRadius: 3, 
                    overflow: 'hidden',
                    position: 'relative',
                    border: '1px solid #e2e8f0',
                    bgcolor: '#fff'
                }}
            >
                <FallbackListView events={events} onMarkerClick={onMarkerClick} />
            </Paper>
        );
    }

    return (
        <Paper 
            elevation={0} 
            sx={{ 
                width: '100%', 
                height: '100%', 
                minHeight: '600px',
                borderRadius: 3, 
                overflow: 'hidden',
                position: 'relative',
                border: '1px solid #e2e8f0'
            }}
        >
            {/* Loading State */}
            {(!mapLoaded || !sdkReady) && !mapError && !useFallback && <MapSkeleton />}
            
            {/* Error State - show fallback instead */}
            {mapError && !useFallback && (
                <FallbackListView events={events} onMarkerClick={onMarkerClick} />
            )}
            
            {/* Map Container */}
            {!mapError && <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />}
            
            {/* Map Controls */}
            {mapLoaded && !mapError && (
                <Fade in timeout={500}>
                    <Box>
                        <MapControls 
                            onZoomIn={handleZoomIn}
                            onZoomOut={handleZoomOut}
                            onRecenter={handleRecenter}
                        />
                    </Box>
                </Fade>
            )}
            
            {/* Map Legend */}
            {mapLoaded && !mapError && (
                <Fade in timeout={700}>
                    <Box>
                        <MapLegend {...markerCounts} />
                    </Box>
                </Fade>
            )}
        </Paper>
    );
});

LivePulseMap.displayName = 'LivePulseMap';

export default LivePulseMap;