# GPS-Based Check-in System Setup Guide

## Overview

This enhanced GPS-based check-in system provides real-time attendance tracking for event crew members using browser geolocation API and Ola Maps integration for location display and geocoding.

## Features Implemented

### 📱 **Crew Check-in Features**
- **GPS Location Verification**: Validates team member location within 100m radius of event venue
- **Real-time Status Updates**: Live tracking of check-in/check-out status
- **Distance Calculation**: Shows distance and direction to venue
- **Accuracy Validation**: Ensures GPS accuracy is sufficient (≤50m) for reliable tracking
- **Offline Support**: Graceful handling of poor network conditions
- **Location Permission Management**: Guided flow for enabling location services

### 👥 **Admin Dashboard Features**
- **Live Map View**: Real-time visualization of team locations and event venues
- **Attendance Analytics**: Comprehensive tracking and reporting
- **Multi-event Support**: Simultaneous monitoring of multiple events
- **Export Functionality**: CSV export of attendance data
- **Status Indicators**: Visual status badges for team members (on-time, late, remote)

### 🗺️ **Ola Maps Integration**
- **Venue Geocoding**: Automatic coordinate lookup for event addresses
- **Interactive Maps**: Live map showing team positions relative to venues
- **Directions Integration**: Direct links to navigation apps
- **Custom Markers**: Color-coded markers for different attendance statuses

## Setup Instructions

### 1. Ola Maps API Configuration

#### Get API Key
1. Visit [Ola Maps Developer Portal](https://developers.olamaps.io/)
2. Create an account or sign in
3. Generate a new API key for your application
4. Enable the following services:
   - Geocoding API
   - Maps JavaScript API
   - Places API

#### Configure Environment Variables
Create or update your environment configuration:

**Frontend (.env):**
```bash
REACT_APP_OLA_MAPS_API_KEY=your_ola_maps_api_key_here
```

**Backend (.env):**
```bash
OLA_MAPS_API_KEY=your_ola_maps_api_key_here
```

### 2. Frontend Setup

#### Install Dependencies
```bash
cd frontend
npm install
```

#### Add Ola Maps Script to Public HTML
Add to `frontend/public/index.html`:
```html
<head>
  <!-- Other head content -->
  <script src="https://api.olamaps.io/tiles/v1/styles/default-light-standard/sprite.js"></script>
  <script>
    window.OlaMaps = {
      apiKey: '%REACT_APP_OLA_MAPS_API_KEY%'
    };
  </script>
</head>
```

#### Update Build Configuration
Ensure your build process replaces environment variables in the HTML template.

### 3. Backend Setup

#### Install Additional Dependencies
```bash
cd backend
pip install requests aiohttp
```

Update `requirements.txt`:
```txt
# Existing dependencies...
requests==2.31.0
aiohttp==3.9.1
```

#### Configure Firestore Indexes
Add to `firestore.indexes.json`:
```json
{
  "indexes": [
    {
      "collectionGroup": "attendance",
      "fields": [
        {"fieldPath": "eventId", "order": "ASCENDING"},
        {"fieldPath": "checkInTime", "order": "ASCENDING"}
      ]
    },
    {
      "collectionGroup": "attendance",
      "fields": [
        {"fieldPath": "userId", "order": "ASCENDING"},
        {"fieldPath": "eventId", "order": "ASCENDING"}
      ]
    }
  ]
}
```

Deploy indexes:
```bash
firebase deploy --only firestore:indexes
```

### 4. Location Permissions Setup

#### Browser Permission Handling
The system automatically handles location permission requests with:
- Permission status detection
- User-friendly error messages
- Guidance for enabling location services
- Graceful fallback for denied permissions

#### Mobile App Considerations
For mobile app deployment:
- Add location permissions to app manifests
- Implement background location tracking (if needed)
- Handle location permission edge cases

### 5. Event Venue Configuration

#### Coordinate Format
Events should include venue coordinates in one of these formats:

**Option 1: Embedded Coordinates**
```
Venue Name, City (17.4065,78.4772)
```

**Option 2: Address-based (with Ola Maps geocoding)**
```
123 Main Street, Hyderabad, Telangana, India
```

#### Database Structure
Event documents should include:
```javascript
{
  name: "Event Name",
  venue: "Venue Name, City (17.4065,78.4772)",
  date: "2025-07-08",
  time: "10:00",
  assignedCrew: [
    {
      userId: "user123",
      name: "Team Member Name",
      role: "Lead Photographer"
    }
  ]
}
```

## Usage Guide

### 📱 For Team Members

#### Check-in Process
1. **Open Event Dashboard**: Navigate to Team Dashboard → GPS Check-in tab
2. **Enable Location**: Allow location access when prompted
3. **Verify Location**: System shows distance to venue and GPS accuracy
4. **Check-in**: Click "Check In" button when within 100m of venue
5. **Work Tracking**: System tracks your presence at the event
6. **Check-out**: Click "Check Out" when work is completed

#### Troubleshooting Location Issues
- **Permission Denied**: Go to browser settings → Privacy → Location → Allow
- **Poor Accuracy**: Move to an open area, avoid buildings/tunnels
- **Outside Range**: Use "Get Directions" to navigate to venue
- **Network Issues**: System supports offline check-in with sync when reconnected

### 👥 For Administrators

#### Monitor Live Attendance
1. **Access Dashboard**: Navigate to Live Attendance from main menu
2. **View Overview**: See summary of all events and attendance rates
3. **Live Map**: Switch to map view to see real-time team positions
4. **Event Details**: Click on events for detailed attendance breakdown
5. **Export Data**: Download attendance reports as CSV

#### Dashboard Features
- **Auto-refresh**: Enable for real-time updates every 15 seconds
- **Filter Options**: View all events, active only, or those with issues
- **Status Indicators**: 
  - 🟢 Green: On-time check-in
  - 🟡 Yellow: Late arrival
  - 🔵 Blue: Remote check-in (outside range)
  - ⚫ Gray: Completed work

## API Endpoints

### Team Member Endpoints
```javascript
// Check in to event
POST /api/attendance/check-in
{
  eventId: "event123",
  latitude: 17.4065,
  longitude: 78.4772,
  accuracy: 25.5
}

// Check out from event
POST /api/attendance/check-out
{
  eventId: "event123",
  latitude: 17.4065,
  longitude: 78.4772,
  notes: "Work completed successfully"
}

// Get attendance status
GET /api/attendance/event/{event_id}/status
```

### Admin Endpoints
```javascript
// Live dashboard data
GET /api/attendance/dashboard/live

// Event-specific attendance
GET /api/attendance/event/{event_id}/admin?client_id={client_id}
```

## Security & Privacy

### Location Data Protection
- Location data is only stored for work-related events
- Coordinates are not tracked outside of check-in/check-out
- Data retention follows organizational policies
- No personal location history is maintained

### Access Controls
- Team members can only check-in to assigned events
- Admins have read-only access to attendance data
- Location permissions are explicitly requested
- All API endpoints require authentication

## Troubleshooting

### Common Issues

**Location Not Available**
- Ensure device has GPS/network location enabled
- Check browser location permissions
- Try refreshing the page

**Map Not Loading**
- Verify Ola Maps API key is correct
- Check network connectivity
- Ensure API quotas are not exceeded

**Check-in Failing**
- Confirm you're assigned to the event
- Verify you're within 100m of venue
- Check GPS accuracy (should be ≤50m)

**Attendance Not Updating**
- Enable auto-refresh on dashboard
- Check Firebase connection
- Verify user permissions

### Support & Monitoring

#### Performance Monitoring
- Monitor API response times
- Track GPS accuracy distribution
- Analyze check-in success rates

#### Analytics Available
- Team punctuality trends
- Location accuracy metrics
- System usage patterns
- Event completion rates

## Future Enhancements

### Planned Features
- **Geofencing**: Advanced boundary detection
- **Beacon Integration**: Indoor location tracking
- **Time Tracking**: Automatic break detection
- **Route Optimization**: Suggest optimal travel routes
- **Weather Integration**: Location-based weather alerts
- **Offline Mode**: Full offline check-in capability

### Integration Opportunities
- **Calendar Systems**: Sync with Google Calendar/Outlook
- **Payroll Systems**: Automatic timesheet generation
- **Communication**: SMS/WhatsApp attendance notifications
- **Analytics**: Advanced reporting and insights

## Deployment Checklist

- [ ] Ola Maps API key configured
- [ ] Environment variables set
- [ ] Firestore indexes deployed
- [ ] Location permissions tested
- [ ] Map loading verified
- [ ] Check-in flow tested
- [ ] Admin dashboard accessible
- [ ] Export functionality working
- [ ] Mobile responsiveness checked
- [ ] Error handling tested

---

**Need Help?** Contact the development team or refer to the [Ola Maps Documentation](https://docs.olamaps.io/) for additional API details.
