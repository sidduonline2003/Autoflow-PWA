import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Paper, CircularProgress } from '@mui/material';
import { renderToString } from 'react-dom/server';
import { 
    Person as PersonIcon, 
    LocationOn as LocationOnIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
    AccessTime as AccessTimeIcon
} from '@mui/icons-material';

const OLA_MAPS_API_KEY = process.env.REACT_APP_OLA_MAPS_API_KEY || 'your_ola_maps_api_key';

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
        display: none; /* Hidden by default, shown on hover logic if needed */
    }
`;

const LivePulseMap = ({ events, onMarkerClick }) => {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef([]);
    const [mapLoaded, setMapLoaded] = useState(false);

    // Initialize Map
    useEffect(() => {
        if (!mapContainerRef.current || mapInstanceRef.current) return;

        try {
            // Inject styles
            const styleSheet = document.createElement("style");
            styleSheet.innerText = pulseStyles;
            document.head.appendChild(styleSheet);

            const map = new window.OlaMaps.Map({
                container: mapContainerRef.current,
                center: [78.4772, 17.4065], // Default to Hyderabad
                zoom: 11,
                style: 'https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json',
                transformRequest: (url, resourceType) => {
                    if (url.startsWith('https://api.olamaps.io')) {
                        return { url: `${url}?api_key=${OLA_MAPS_API_KEY}` };
                    }
                    return { url };
                }
            });

            map.on('load', () => {
                setMapLoaded(true);
                mapInstanceRef.current = map;
            });

        } catch (error) {
            console.error("Error initializing Ola Maps:", error);
        }

        return () => {
            // Cleanup markers if needed
            markersRef.current.forEach(marker => marker.remove());
        };
    }, []);

    // Update Markers when data changes
    useEffect(() => {
        if (!mapLoaded || !mapInstanceRef.current || !events) return;

        const map = mapInstanceRef.current;

        // Clear existing markers
        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];

        const bounds = new window.OlaMaps.LngLatBounds();
        let hasPoints = false;

        // 1. Render Event Venues (Geofence Centers)
        events.forEach(event => {
            const coords = parseCoordinates(event.venue);
            if (!coords) return;
            
            hasPoints = true;
            bounds.extend(coords);

            // Create Venue/Geofence Marker (Static Green Zone)
            const el = document.createElement('div');
            el.className = 'geofence-marker';
            // Inner dot
            el.innerHTML = `
                <div style="
                    width: 20px; 
                    height: 20px; 
                    background: #1976d2; 
                    border: 2px solid white; 
                    border-radius: 50%;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                "></div>
                <div style="
                    position: absolute; 
                    top: 50%; 
                    left: 50%; 
                    transform: translate(-50%, -50%); 
                    width: 120px; 
                    height: 120px; 
                    background: rgba(25, 118, 210, 0.1); 
                    border: 1px dashed rgba(25, 118, 210, 0.4);
                    border-radius: 50%;
                    pointer-events: none;
                "></div>
            `;

            const marker = new window.OlaMaps.Marker({ element: el, anchor: 'center' })
                .setLngLat(coords)
                .addTo(map);
            
            // Popup for Venue
            const popupContent = `
                <div style="padding: 8px; min-width: 150px;">
                    <strong style="color: #1976d2;">${event.eventName}</strong><br/>
                    <span style="font-size: 12px; color: #666;">${event.clientName}</span><br/>
                    <span style="font-size: 11px; color: #888;">Venue Geofence Center</span>
                </div>
            `;
            
            const popup = new window.OlaMaps.Popup({ offset: 25 }).setHTML(popupContent);
            marker.setPopup(popup);

            markersRef.current.push(marker);

            // 2. Render Team Members
            if (event.attendanceRecords) {
                event.attendanceRecords.forEach(record => {
                    if (record.checkInLocation && record.checkInLocation.latitude) {
                        const userCoords = [record.checkInLocation.longitude, record.checkInLocation.latitude];
                        bounds.extend(userCoords);

                        // Determine status class
                        let pulseClass = 'pulse-grey';
                        let statusIcon = <AccessTimeIcon style={{ fontSize: 18 }} />;
                        
                        if (record.status === 'checked_in') {
                            pulseClass = 'pulse-green';
                            statusIcon = <CheckCircleIcon style={{ fontSize: 18 }} />;
                        } else if (record.status === 'checked_in_late' || record.status === 'checked_in_remote') {
                            pulseClass = 'pulse-amber';
                            statusIcon = <WarningIcon style={{ fontSize: 18 }} />;
                        } else if (record.status === 'not_checked_in') {
                             pulseClass = 'pulse-red';
                        }

                        // Create User Marker
                        const userEl = document.createElement('div');
                        userEl.className = `marker-pin ${pulseClass}`;
                        // Convert React Icon to HTML string
                        userEl.innerHTML = renderToString(statusIcon);

                        const userMarker = new window.OlaMaps.Marker({ element: userEl })
                            .setLngLat(userCoords)
                            .addTo(map);

                        // Popup for User
                        const userPopupContent = `
                            <div style="padding: 8px;">
                                <strong>${record.name}</strong><br/>
                                <span style="font-size: 12px;">${record.role}</span><br/>
                                <span style="font-size: 12px; color: ${record.isWithinRange ? 'green' : 'orange'};">
                                    ${record.isWithinRange ? 'Inside Venue' : `${Math.round(record.distance || 0)}m away`}
                                </span><br/>
                                <span style="font-size: 11px; color: #888;">
                                    Last update: ${new Date(record.checkInTime || Date.now()).toLocaleTimeString()}
                                </span>
                            </div>
                        `;

                        const userPopup = new window.OlaMaps.Popup({ offset: 25 }).setHTML(userPopupContent);
                        userMarker.setPopup(userPopup);
                        
                        // Add click listener to focus dashboard on this user
                        userEl.addEventListener('click', () => {
                            if (onMarkerClick) onMarkerClick(record, event);
                        });

                        markersRef.current.push(userMarker);
                    }
                });
            }
        });

        // Fit bounds if we have points
        if (hasPoints) {
            map.fitBounds(bounds, { padding: 50, maxZoom: 16 });
        }

    }, [mapLoaded, events, onMarkerClick]);

    const parseCoordinates = (venueStr) => {
        if (!venueStr) return null;
        try {
            // Expecting format like "Venue Name (lat,lng)" or checking if we have coordinates directly
            // This is a simplified parser based on your backend logic
            const match = venueStr.match(/\(([^)]+)\)/);
            if (match) {
                const [lat, lng] = match[1].split(',').map(Number);
                if (!isNaN(lat) && !isNaN(lng)) return [lng, lat];
            }
            // Fallback to hardcoded coords for demo if string match fails but it's a known venue
            // In production, rely on the venue location object from backend
            return null; 
        } catch (e) {
            return null;
        }
    };

    return (
        <Paper 
            elevation={3} 
            sx={{ 
                width: '100%', 
                height: '100%', 
                minHeight: '600px',
                borderRadius: 3, 
                overflow: 'hidden',
                position: 'relative'
            }}
        >
            {!mapLoaded && (
                <Box sx={{ 
                    position: 'absolute', 
                    top: 0, left: 0, right: 0, bottom: 0, 
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: '#f8f9fa', zIndex: 10 
                }}>
                    <CircularProgress />
                </Box>
            )}
            <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
            
            {/* Map Legend Overlay */}
            <Paper sx={{
                position: 'absolute',
                bottom: 20,
                left: 20,
                p: 2,
                zIndex: 1,
                borderRadius: 2,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(4px)'
            }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Live Status</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#2e7d32', boxShadow: '0 0 0 2px rgba(46, 125, 50, 0.2)' }} />
                        <Typography variant="caption">On Site (Active)</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#ed6c02', boxShadow: '0 0 0 2px rgba(237, 108, 2, 0.2)' }} />
                        <Typography variant="caption">Late / Off-site</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#1976d2', border: '1px dashed #1976d2' }} />
                        <Typography variant="caption">Event Zone (100m)</Typography>
                    </Box>
                </Box>
            </Paper>
        </Paper>
    );
};

export default LivePulseMap;