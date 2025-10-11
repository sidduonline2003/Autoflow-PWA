# 🎯 Equipment Inventory Navigation - Visual Guide

## Quick Reference: Where to Find Equipment Features

---

## 👨‍💼 ADMIN PORTAL

### Location: Left Sidebar → "Equipment Tracking" Section

```
╔══════════════════════════════════════════════════════╗
║  AUTOFLOW ADMIN SUITE                               ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  📊 NAVIGATION                                       ║
║  ├─ Overview                                        ║
║  ├─ Team Management                                 ║
║  ├─ Client Hub                                      ║
║  ├─ Live Attendance                                 ║
║  ├─ Receipt Verification                            ║
║  ├─ Financial Hub                                   ║
║  └─ Accounts Receivable                             ║
║                                                      ║
║  📦 EQUIPMENT TRACKING                        ⭐ NEW ║
║  ├─ 📦 Equipment Dashboard (/equipment)             ║
║  ├─ 📷 QR Scanner (/equipment/scan)                 ║
║  ├─ 🔧 Maintenance (/equipment/maintenance)         ║
║  └─ 📊 Analytics (/equipment/analytics)             ║
║                                                      ║
║  🎬 POST-PRODUCTION                                  ║
║  ├─ My Assignments                                  ║
║  ├─ My Work                                         ║
║  └─ Post Production Hub                             ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
```

### Admin Features:

#### 1. 📦 Equipment Dashboard
**Path:** `/equipment`  
**What it does:**
- View all equipment in your organization
- Filter by category, status, location, availability
- Search by asset ID, name, or serial number
- View equipment cards with photos and QR codes
- Quick actions: View Details, Checkout, Edit, Retire
- Bulk operations: Export to CSV, Print QR codes

**Who can access:** Admins, Managers

#### 2. 📷 QR Scanner
**Path:** `/equipment/scan`  
**What it does:**
- Open camera to scan equipment QR codes
- Instantly view equipment details
- Quick checkout/checkin from scan result
- Manual code entry fallback
- History of recently scanned items

**Who can access:** All authenticated users

#### 3. 🔧 Maintenance
**Path:** `/equipment/maintenance`  
**What it does:**
- View maintenance schedule (calendar view)
- List of overdue maintenance tasks
- Schedule new maintenance
- View maintenance history with costs
- Parts inventory tracking
- Vendor management

**Who can access:** Admins, Maintenance Staff

#### 4. 📊 Analytics
**Path:** `/equipment/analytics`  
**What it does:**
- Equipment utilization heatmap
- Crew responsibility scores leaderboard
- Revenue tracking from external rentals
- Cost analysis (maintenance, depreciation)
- Top/bottom performing assets
- Downtime analysis
- Export reports to PDF/Excel

**Who can access:** Admins, Managers, Accountants

---

## 👥 TEAMMATE PORTAL

### Location: Top Navigation Bar → "Equipment" Button

```
╔══════════════════════════════════════════════════════════════╗
║  Team Portal    [Post-Production ▼]  [Equipment ▼]  [Logout]║
╚══════════════════════════════════════════════════════════════╝
                                          │
                                          │ Click here
                                          ▼
                     ┌────────────────────────────────┐
                     │ 📷 Checkout Equipment          │  ⭐ NEW
                     │ 📷 Check-in Equipment          │  ⭐ NEW
                     │ 📦 My Equipment                │  ⭐ NEW
                     └────────────────────────────────┘
```

### Teammate Features:

#### 1. 📷 Checkout Equipment
**Path:** `/equipment/checkout`  
**What it does:**
- **Step 1:** Scan equipment QR code
- **Step 2:** Select event and return date
- **Step 3:** Inspect condition (5 levels)
- **Step 4:** Review and confirm
- Works offline (queues for sync)
- Photo capture for condition documentation
- Accessory checklist

**Who can access:** All teammates (role: teammate, editor, photographer, etc.)

#### 2. 📷 Check-in Equipment
**Path:** `/equipment/checkin`  
**What it does:**
- **Step 1:** Scan equipment QR code
- **Step 2:** Review checkout details
- **Step 3:** Inspect return condition
- **Step 4:** Report any damage (with photos)
- Shows days used and overdue status
- Automatic responsibility score calculation

**Who can access:** All teammates

#### 3. 📦 My Equipment
**Path:** `/equipment/my-checkouts`  
**What it does:**
- List of currently checked out equipment
- Return date reminders
- Days remaining/overdue indicators
- Quick check-in button
- Equipment photos and details
- Contact admin for issues

**Who can access:** All teammates (shows only their checkouts)

---

## 📱 Mobile Experience

### Admin on Mobile:

```
┌─────────────────────────────┐
│ ☰  Admin Control Center  👤 │  ← Hamburger menu
└─────────────────────────────┘
      │
      │ Tap hamburger
      ▼
┌─────────────────────────────┐
│  Autoflow                   │
│  Admin Suite                │
├─────────────────────────────┤
│                             │
│ NAVIGATION                  │
│ EQUIPMENT TRACKING    ← Scrollable
│ POST-PRODUCTION             │
│ ADMINISTRATION              │
│                             │
└─────────────────────────────┘
```

### Teammate on Mobile:

```
┌─────────────────────────────┐
│ Team Portal    ⋮  Equipment │  ← Equipment always visible
└─────────────────────────────┘
                      │
                      │ Tap Equipment
                      ▼
              ┌────────────────┐
              │ 📷 Checkout    │
              │ 📷 Check-in    │
              │ 📦 My Items    │
              └────────────────┘
```

---

## 🎯 Common User Journeys

### Journey 1: Teammate Checks Out Camera
```
1. Login → Team Portal
2. Tap "Equipment" → Select "Checkout Equipment"
3. Camera opens → Scan QR code on camera
4. System validates: Camera is AVAILABLE ✅
5. Select event from dropdown
6. Set return date (auto-suggests event end date + 1 day)
7. Inspect condition → Select "Excellent"
8. Take photo (optional)
9. Review summary → Tap "Confirm Checkout"
10. Success! Toast notification + equipment marked CHECKED_OUT
```

### Journey 2: Admin Views Utilization Analytics
```
1. Login → Admin Portal
2. Sidebar → "Equipment Tracking" → "Analytics"
3. Dashboard loads with 7 widgets:
   - Total Assets: 156
   - Utilization Rate: 73%
   - Active Checkouts: 42
   - In Maintenance: 8
   - This Month Revenue: ₹2.4L
   - Top Earner: Sony A7S III (₹82K)
   - Low Performers: 12 assets
4. Click "Utilization Heatmap"
5. Calendar view shows busy dates in red
6. Click specific date → See which equipment was in use
7. Export report → PDF downloaded
```

### Journey 3: Manager Schedules Maintenance
```
1. Login → Admin Portal
2. Sidebar → "Equipment Tracking" → "Maintenance"
3. Calendar shows overdue items in red (⚠️ 3 overdue)
4. Click "Schedule Maintenance" button
5. Search for equipment: "Canon 5D"
6. Select maintenance type: "Sensor Cleaning"
7. Select vendor: "Camera Service Center"
8. Set due date: Next week
9. Add estimated cost: ₹2,500
10. Add notes: "Customer reported dust spots"
11. Save → Maintenance scheduled ✅
12. Equipment status changes to MAINTENANCE
13. Crew gets alert: "Canon 5D unavailable for 3 days"
```

---

## 🔐 Role-Based Access Control

| Feature | Admin | Manager | Teammate | Editor | Accountant |
|---------|-------|---------|----------|--------|------------|
| **Checkout Equipment** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Check-in Equipment** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **View Dashboard** | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Create Equipment** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Edit Equipment** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Retire Equipment** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Schedule Maintenance** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **View Analytics** | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Manage Vendors** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **External Rentals** | ✅ | ✅ | ❌ | ❌ | ✅ |

---

## 🎨 Visual Design Elements

### Admin Sidebar Item:
```
┌────────────────────────────────┐
│ 📦 Equipment Dashboard         │  ← Icon + Label
└────────────────────────────────┘
     │
     │ Hover effect
     ▼
┌────────────────────────────────┐
│ 📦 Equipment Dashboard     ➤  │  ← Slight shift right
└────────────────────────────────┘  ← Blue gradient background
```

### Teammate Dropdown Menu:
```
┌──────────────────────────────┐
│  📷  Checkout Equipment      │  ← Icon aligned left
│  📷  Check-in Equipment      │  ← Hover highlights row
│  📦  My Equipment            │  ← Touch-friendly height
└──────────────────────────────┘
```

### Active Route Indicator:
```
Admin Sidebar (Current: /equipment)
┌────────────────────────────────┐
│ 📦 Equipment Dashboard    ✓   │  ← Selected (blue gradient)
│ 📷 QR Scanner                  │  ← Default (gray)
│ 🔧 Maintenance                 │
│ 📊 Analytics                   │
└────────────────────────────────┘
```

---

## 🚀 Quick Actions

### Admin Quick Actions:
- **Ctrl/Cmd + K** → Global search (future)
- **Click dashboard card** → Jump to filtered view
- **Right-click equipment** → Context menu (checkout, edit, retire)

### Teammate Quick Actions:
- **Long press Equipment button** → Open last used flow
- **Scan from anywhere** → Equipment button badge shows scan icon
- **Pull to refresh** → Update my checkouts list

---

## 📊 Navigation Analytics

Track these metrics to improve UX:
- Most used admin feature (likely Dashboard)
- Most used teammate feature (likely Checkout)
- Average time from scan to checkout complete
- Navigation abandonment rate
- Mobile vs desktop usage split

---

## 🐛 Troubleshooting Navigation

### Issue: "Equipment menu not showing"
**Solution:**
1. Check if user is authenticated
2. Verify role is not restricted
3. Clear browser cache
4. Check console for errors

### Issue: "Routes not loading"
**Solution:**
1. Ensure routes are registered in `App.js`
2. Check React Router version compatibility
3. Verify component imports
4. Check for typos in path names

### Issue: "Navigation slow on mobile"
**Solution:**
1. Reduce menu animation duration
2. Lazy load route components
3. Optimize Material-UI theme
4. Use React.memo for menu items

---

## ✅ Checklist: Is Navigation Working?

### Admin Portal:
- [ ] Login as admin
- [ ] See "Equipment Tracking" section in sidebar
- [ ] Click "Equipment Dashboard" → Navigates to `/equipment`
- [ ] Click "QR Scanner" → Navigates to `/equipment/scan`
- [ ] Click "Maintenance" → Navigates to `/equipment/maintenance`
- [ ] Click "Analytics" → Navigates to `/equipment/analytics`
- [ ] Active route is highlighted in blue
- [ ] Icons display correctly
- [ ] Mobile hamburger menu works

### Team Portal:
- [ ] Login as teammate
- [ ] See "Equipment" button in top bar
- [ ] Click "Equipment" → Dropdown opens
- [ ] Click "Checkout Equipment" → Navigates to `/equipment/checkout`
- [ ] Click "Check-in Equipment" → Navigates to `/equipment/checkin`
- [ ] Click "My Equipment" → Navigates to `/equipment/my-checkouts`
- [ ] Menu closes after selection
- [ ] Works on mobile device

---

## 🎓 Developer Notes

### File Locations:
```
Navigation code added to:
├─ /frontend/src/components/layout/AdminLayout.js
│  └─ Lines 34-37: Icon imports
│  └─ Lines 121-129: Equipment section definition
│
└─ /frontend/src/pages/TeamDashboardPage.js
   └─ Lines 10-11: Icon imports  
   └─ Line 113: State management
   └─ Lines 774-783: Event handlers
   └─ Lines 830-851: Menu JSX
```

### To Add More Items:
```javascript
// In AdminLayout.js
{
    title: 'Equipment Tracking',
    items: [
        // ... existing items
        { 
            label: 'External Rentals', 
            icon: BusinessIcon, 
            path: '/equipment/rentals' 
        }, // ⭐ Add new item here
    ],
}
```

### To Add Role Restrictions:
```javascript
// Filter items based on role
const equipmentItems = [
    { label: 'Dashboard', ... },
    { label: 'Analytics', ..., roles: ['admin', 'manager'] }
].filter(item => !item.roles || item.roles.includes(currentRole));
```

---

## 🎉 Summary

✅ **Navigation is live in both portals**  
✅ **7 new routes for equipment management**  
✅ **Mobile-responsive dropdowns and sidebars**  
✅ **Icon-based visual hierarchy**  
✅ **Consistent with existing UI patterns**  

**Next Steps:**
1. Create page components for each route
2. Add route definitions to `App.js`
3. Test on mobile devices
4. Add role-based restrictions
5. Implement analytics tracking

---

**Questions?** Refer to:
- `EQUIPMENT_NAVIGATION_ADDED.md` - Implementation details
- `EQUIPMENT_INVENTORY_IMPLEMENTATION_GUIDE.md` - Full setup
- `README_EQUIPMENT.md` - User documentation
