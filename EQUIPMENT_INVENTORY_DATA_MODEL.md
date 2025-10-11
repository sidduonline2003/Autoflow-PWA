# Equipment Inventory Management - Firestore Data Model

## Overview
This document defines the complete Firestore data structure for the equipment inventory management system with QR code tracking, offline-first support, and comprehensive analytics.

---

## Collection Structure

### `/organizations/{orgId}/equipment/{assetId}`
**Main equipment/asset collection with complete lifecycle tracking**

```json
{
  // Core Identity
  "assetId": "ASSET_01HJKM3QRXYZ123ABC",
  "qrCodeUrl": "https://storage.googleapis.com/bucket/qr/ASSET_01HJKM3QRXYZ123ABC.png",
  "name": "Sony A7III Camera Body",
  "category": "camera",  // ENUM: camera, lens, lighting, audio, grip, drone, misc
  
  // Specifications
  "model": "ILCE-7M3",
  "serialNumber": "SN123456789",
  "manufacturer": "Sony",
  "description": "Full-frame mirrorless camera with 24.2MP sensor",
  
  // Financial Data
  "purchaseDate": "2024-01-15T00:00:00Z",
  "purchasePrice": 165000,  // in INR
  "bookValue": 148500,  // Depreciated value
  "depreciationRate": 10,  // Percentage per year
  "dailyRentalRate": 3500,  // For external rentals & internal costing
  
  // Current Status
  "status": "AVAILABLE",  // ENUM: AVAILABLE, CHECKED_OUT, MAINTENANCE, MISSING, RETIRED
  "currentHolder": {
    "uid": "user123",
    "name": "John Doe",
    "email": "john@example.com",
    "eventId": "evt_abc123",  // Optional - links to event if internal checkout
    "rentalType": "internal"  // ENUM: internal, external, vendor_borrowed
  },  // null when available
  
  // Location
  "homeLocation": "LOC_STUDIO_MAIN",  // Default/assigned location
  "currentLocation": "LOC_STUDIO_MAIN",  // Real-time location
  "lastKnownGPS": {
    "latitude": 12.9716,
    "longitude": 77.5946,
    "timestamp": "2024-10-12T10:30:00Z"
  },
  
  // Media
  "photos": [
    {
      "url": "https://storage.googleapis.com/.../front.jpg",
      "caption": "Front view",
      "uploadedAt": "2024-01-15T10:00:00Z",
      "uploadedBy": "admin_uid"
    }
  ],
  
  // Maintenance Configuration
  "maintenanceSchedule": {
    "intervalDays": 30,  // Preventive maintenance every 30 days
    "lastMaintenanceDate": "2024-09-15T00:00:00Z",
    "nextDueDate": "2024-10-15T00:00:00Z",
    "alertThresholdDays": 7  // Alert 7 days before due
  },
  
  // Consumable/Battery Tracking (Optional)
  "consumableData": {
    "type": "battery",  // ENUM: battery, memoryCard, tape, none
    "cycleCount": 245,  // For batteries
    "maxCycles": 500,
    "capacityMah": 2280,
    "expiryDate": null,  // For memory cards/tapes
    "alertThreshold": 450,  // Alert at 450 cycles
    "lastReplacementDate": "2024-01-15T00:00:00Z"
  },
  
  // Vendor Equipment (If borrowed from external vendor)
  "vendorData": {
    "isVendorEquipment": true,
    "vendorId": "vendor_xyz",
    "vendorName": "Pro Camera Rentals",
    "rentalCostPerDay": 2500,
    "borrowedDate": "2024-10-01T00:00:00Z",
    "expectedReturnDate": "2024-10-20T00:00:00Z",
    "securityDeposit": 50000,
    "depositStatus": "held",  // ENUM: held, refunded
    "agreementUrl": "https://storage.googleapis.com/.../vendor_agreement.pdf"
  },
  
  // Analytics & Usage Metrics
  "totalDaysUsed": 125,  // Cumulative days checked out
  "totalCheckouts": 42,
  "totalDaysInMaintenance": 8,
  "utilizationRate": 35.2,  // Percentage (totalDaysUsed / days since purchase * 100)
  "lastCheckoutDate": "2024-10-10T08:00:00Z",
  "lastCheckinDate": "2024-10-11T18:00:00Z",
  "averageCheckoutDuration": 2.8,  // Average days per checkout
  
  // Revenue Tracking
  "totalExternalRentalRevenue": 87500,  // Cumulative revenue from external rentals
  "externalRentalCount": 12,
  "totalMaintenanceCost": 15000,  // Cumulative maintenance costs
  
  // Condition History
  "conditionScore": 85,  // 0-100 based on return condition logs
  "damageIncidents": 2,  // Count of damage reports
  "lastConditionCheck": {
    "condition": "good",  // ENUM: excellent, good, minor_wear, needs_cleaning, damaged
    "checkedAt": "2024-10-11T18:00:00Z",
    "checkedBy": "user123",
    "notes": "Minor dust on lens mount"
  },
  
  // Insurance & Warranty
  "insurance": {
    "provider": "HDFC Ergo",
    "policyNumber": "POL123456",
    "coverageAmount": 200000,
    "expiryDate": "2025-01-15T00:00:00Z",
    "premiumAmount": 8000
  },
  "warranty": {
    "provider": "Sony India",
    "expiryDate": "2026-01-15T00:00:00Z",
    "type": "manufacturer"  // ENUM: manufacturer, extended, third_party
  },
  
  // Audit Fields
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-10-11T18:05:00Z",
  "createdBy": "admin_uid",
  "lastModifiedBy": "admin_uid",
  
  // Flags
  "isRetired": false,
  "isHighValue": true,  // Items > ₹100,000
  "requiresApproval": true,  // Needs admin approval for checkout
  "tags": ["4K", "full-frame", "weather-sealed"]  // Custom tags for filtering
}
```

---

### `/organizations/{orgId}/equipment/{assetId}/checkouts/{checkoutId}`
**Individual checkout/check-in transaction log**

```json
{
  // Identity
  "checkoutId": "CHK_01HJKM3QRXYZ123ABC",
  "assetId": "ASSET_01HJKM3QRXYZ123ABC",
  "assetName": "Sony A7III Camera Body",  // Denormalized for quick queries
  
  // User Info
  "uid": "user123",
  "userName": "John Doe",
  "userRole": "editor",
  "userEmail": "john@example.com",
  
  // Checkout Type
  "checkoutType": "internal_event",  // ENUM: internal_event, external_rental, vendor_return
  
  // Event Linkage (for internal checkouts)
  "eventId": "evt_abc123",
  "eventName": "Wedding Shoot - Sharma Family",
  "eventDate": "2024-10-13T00:00:00Z",
  
  // External Rental Info (if applicable)
  "rentalClientInfo": {
    "name": "ABC Productions",
    "contact": "+919876543210",
    "email": "contact@abcprod.com",
    "clientType": "studio",  // ENUM: studio, freelancer, corporate
    "agreementUrl": "https://storage.googleapis.com/.../rental_agreement.pdf",
    "panNumber": "ABCDE1234F",
    "gstNumber": "29ABCDE1234F1Z5"
  },
  
  // Checkout Timing
  "checkedOutAt": "2024-10-10T08:00:00Z",
  "checkedOutBy": "admin_uid",  // Who approved/processed checkout
  "expectedReturnDate": "2024-10-11T20:00:00Z",
  "actualReturnDate": "2024-10-11T18:00:00Z",  // null until checked in
  "daysUsed": 2,  // Calculated: ceil((actualReturn - checkedOut) / 1 day)
  "isOverdue": false,
  "daysOverdue": 0,
  
  // Location Tracking
  "checkoutLocation": {
    "locationType": "office",  // ENUM: office, remote, client_site
    "locationId": "LOC_STUDIO_MAIN",
    "gps": {
      "latitude": 12.9716,
      "longitude": 77.5946
    },
    "address": "123 MG Road, Bangalore"
  },
  "checkinLocation": {
    "locationType": "office",
    "locationId": "LOC_STUDIO_MAIN",
    "gps": {
      "latitude": 12.9716,
      "longitude": 77.5946
    }
  },
  
  // Condition Inspection
  "checkoutCondition": "good",  // ENUM: excellent, good, minor_wear, needs_cleaning, damaged
  "checkoutNotes": "All accessories included, battery at 100%",
  "checkoutPhotos": [
    {
      "url": "https://storage.googleapis.com/.../checkout_front.jpg",
      "uploadedAt": "2024-10-10T08:05:00Z"
    }
  ],
  
  "returnCondition": "good",  // Same ENUM
  "returnNotes": "Minor dust on sensor, battery at 20%",
  "returnPhotos": [
    {
      "url": "https://storage.googleapis.com/.../return_front.jpg",
      "uploadedAt": "2024-10-11T18:02:00Z"
    }
  ],
  
  // Damage Reporting
  "damageReport": {
    "hasDamage": false,
    "description": "",
    "severity": "",  // ENUM: minor, moderate, major, critical
    "photos": [],
    "estimatedRepairCost": 0,
    "reportedBy": "user123",
    "reportedAt": null,
    "repairStatus": ""  // ENUM: pending, in_progress, completed
  },
  
  // Financial (for external rentals)
  "rentalRevenue": 7000,  // dailyRate × daysUsed
  "securityDeposit": 15000,
  "depositRefunded": true,
  "depositRefundDate": "2024-10-11T19:00:00Z",
  "depositDeductions": 0,  // Amount deducted for damage
  "paymentStatus": "paid",  // ENUM: pending, paid, partial, overdue
  "invoiceId": "INV_2024_001234",
  
  // Overdue Management
  "overdueAlertsSent": [
    {
      "day": 1,  // Days overdue when alert sent
      "sentAt": "2024-10-12T06:00:00Z",
      "recipients": ["user123", "admin_uid"],
      "type": "email"  // ENUM: email, sms, in_app, whatsapp
    }
  ],
  
  // Accessories Included
  "accessories": [
    {
      "name": "Battery Grip",
      "quantity": 1,
      "returned": true
    },
    {
      "name": "Extra Battery",
      "quantity": 2,
      "returned": true
    }
  ],
  
  // Approval Workflow (if required)
  "requiresApproval": false,
  "approvalStatus": "approved",  // ENUM: pending, approved, rejected
  "approvedBy": "admin_uid",
  "approvedAt": "2024-10-10T07:55:00Z",
  "rejectionReason": null,
  
  // Audit
  "createdAt": "2024-10-10T08:00:00Z",
  "updatedAt": "2024-10-11T18:05:00Z",
  "syncedToDevice": true,  // For offline tracking
  "offlineCheckout": false  // Was this done offline?
}
```

---

### `/organizations/{orgId}/equipment/{assetId}/maintenance/{maintenanceId}`
**Maintenance and repair tracking**

```json
{
  // Identity
  "maintenanceId": "MNT_01HJKM3QRXYZ123ABC",
  "assetId": "ASSET_01HJKM3QRXYZ123ABC",
  "assetName": "Sony A7III Camera Body",
  
  // Type & Classification
  "type": "preventive",  // ENUM: preventive, repair, cleaning, calibration, upgrade
  "priority": "medium",  // ENUM: low, medium, high, critical
  "category": "scheduled",  // ENUM: scheduled, emergency, damage_related
  
  // Issue Details
  "issue": "Routine sensor cleaning and firmware update",
  "symptoms": "Minor dust spots visible in test shots",
  "rootCause": "Normal wear from regular use",
  
  // Scheduling
  "scheduledDate": "2024-10-15T00:00:00Z",
  "startDate": "2024-10-15T09:00:00Z",
  "completionDate": "2024-10-15T14:30:00Z",
  "estimatedDuration": 4,  // Hours
  "actualDuration": 5.5,  // Hours
  
  // Personnel
  "technicianId": "tech_uid",
  "technicianName": "Service Center",
  "vendorName": "Sony Service Center - MG Road",
  "vendorContact": "+918012345678",
  "internalTechnician": false,
  
  // Work Performed
  "workPerformed": [
    "Sensor cleaning with ultrasonic method",
    "Firmware updated to v4.01",
    "Autofocus calibration",
    "General inspection"
  ],
  
  // Parts & Costs
  "partsReplaced": [
    {
      "partName": "Sensor cleaning kit",
      "partNumber": "SCK-123",
      "quantity": 1,
      "unitCost": 500,
      "totalCost": 500,
      "supplier": "Sony India"
    }
  ],
  "laborCost": 2000,
  "partsTotal": 500,
  "totalCost": 2500,
  
  // Documentation
  "notes": "Sensor cleaning successful. Firmware update resolved AF speed issue.",
  "photos": [
    {
      "url": "https://storage.googleapis.com/.../before_cleaning.jpg",
      "caption": "Before cleaning",
      "uploadedAt": "2024-10-15T09:00:00Z"
    },
    {
      "url": "https://storage.googleapis.com/.../after_cleaning.jpg",
      "caption": "After cleaning",
      "uploadedAt": "2024-10-15T14:30:00Z"
    }
  ],
  "serviceReportUrl": "https://storage.googleapis.com/.../service_report.pdf",
  
  // Status
  "status": "completed",  // ENUM: scheduled, in_progress, completed, cancelled, on_hold
  "completionNotes": "Asset returned to available status, next maintenance due 2024-11-15",
  
  // Follow-up
  "followUpRequired": false,
  "followUpDate": null,
  "followUpNotes": "",
  
  // Linked to Damage Report (if repair)
  "linkedCheckoutId": null,
  "linkedDamageReportId": null,
  
  // Warranty Coverage
  "coveredByWarranty": false,
  "warrantyClaimNumber": null,
  
  // Downtime Impact
  "downtimeDays": 1,
  "impactedEvents": [],  // Array of eventIds that were affected
  
  // Audit
  "createdAt": "2024-10-10T10:00:00Z",
  "createdBy": "admin_uid",
  "updatedAt": "2024-10-15T14:35:00Z",
  "lastModifiedBy": "admin_uid"
}
```

---

### `/organizations/{orgId}/equipment/{assetId}/externalRentals/{rentalId}`
**External rental bookings and revenue tracking**

```json
{
  // Identity
  "rentalId": "RNT_01HJKM3QRXYZ123ABC",
  "assetId": "ASSET_01HJKM3QRXYZ123ABC",
  "assetName": "Sony A7III Camera Body",
  
  // Client Information
  "clientName": "ABC Productions",
  "clientContact": "+919876543210",
  "clientEmail": "contact@abcprod.com",
  "clientType": "studio",  // ENUM: studio, freelancer, corporate, individual
  "clientAddress": "45 Residency Road, Bangalore",
  "panNumber": "ABCDE1234F",
  "gstNumber": "29ABCDE1234F1Z5",
  
  // Rental Period
  "rentalStartDate": "2024-10-10T08:00:00Z",
  "rentalEndDate": "2024-10-13T18:00:00Z",
  "actualReturnDate": "2024-10-13T17:00:00Z",
  "daysRented": 4,
  
  // Pricing
  "dailyRate": 3500,
  "totalRevenue": 14000,  // dailyRate × daysRented
  "discountPercent": 0,
  "discountAmount": 0,
  "finalAmount": 14000,
  "gstAmount": 2520,  // 18% GST
  "totalWithGst": 16520,
  
  // Security Deposit
  "securityDeposit": 15000,
  "depositStatus": "refunded",  // ENUM: held, refunded, forfeited
  "depositRefundDate": "2024-10-13T18:30:00Z",
  "depositDeductions": 0,
  "deductionReason": "",
  
  // Payment
  "paymentStatus": "paid",  // ENUM: pending, partial, paid, overdue
  "paymentMethod": "bank_transfer",  // ENUM: cash, bank_transfer, upi, card, cheque
  "paymentDate": "2024-10-10T07:30:00Z",
  "transactionId": "TXN_123456",
  "invoiceId": "INV_2024_001234",
  "invoiceUrl": "https://storage.googleapis.com/.../invoice.pdf",
  
  // Agreement
  "agreementUrl": "https://storage.googleapis.com/.../rental_agreement.pdf",
  "agreementSigned": true,
  "signedDate": "2024-10-10T07:45:00Z",
  "digitalSignature": "data:image/png;base64,...",
  
  // Linkages
  "checkoutId": "CHK_01HJKM3QRXYZ123ABC",  // Links to checkouts collection
  
  // Rental Terms
  "terms": [
    "Client responsible for damage beyond normal wear",
    "Late return charges: ₹1000/day",
    "Equipment must be returned clean and in working condition"
  ],
  "lateReturnCharges": 0,
  "cleaningCharges": 0,
  "otherCharges": 0,
  
  // Delivery
  "deliveryRequired": false,
  "deliveryAddress": "",
  "deliveryCharges": 0,
  "pickupRequired": false,
  
  // Status
  "status": "completed",  // ENUM: booked, active, completed, cancelled
  "cancellationReason": null,
  "cancelledBy": null,
  "cancelledAt": null,
  
  // Audit
  "createdAt": "2024-10-09T15:00:00Z",
  "createdBy": "admin_uid",
  "updatedAt": "2024-10-13T18:35:00Z",
  "lastModifiedBy": "admin_uid"
}
```

---

### `/organizations/{orgId}/locations/{locationId}`
**Physical locations/inventory zones with master QR codes**

```json
{
  // Identity
  "locationId": "LOC_STUDIO_MAIN",
  "gln": "1234567890128",  // Global Location Number (optional, for GS1 compliance)
  "qrCodeUrl": "https://storage.googleapis.com/.../LOC_STUDIO_MAIN.png",
  
  // Details
  "name": "Studio Main Inventory",
  "type": "studio",  // ENUM: studio, warehouse, vehicle, client_site, remote
  "description": "Main equipment storage room at MG Road studio",
  
  // Address
  "address": "123 MG Road, Bangalore, Karnataka 560001",
  "gps": {
    "latitude": 12.9716,
    "longitude": 77.5946
  },
  
  // Capacity
  "capacityLimit": 100,  // Max assets that can be stored
  "currentCount": 45,
  
  // Access Control
  "accessLevel": "restricted",  // ENUM: public, restricted, admin_only
  "authorizedUsers": ["admin_uid", "manager_uid"],
  
  // Contact
  "contactPerson": "Warehouse Manager",
  "contactPhone": "+918012345678",
  
  // QR Code Settings
  "qrCodeFormat": "simple",  // ENUM: simple, gln, custom
  "requiresScanAtCheckout": true,  // Validate location during checkout
  
  // Status
  "isActive": true,
  
  // Audit
  "createdAt": "2024-01-15T10:00:00Z",
  "createdBy": "admin_uid",
  "updatedAt": "2024-10-12T10:00:00Z"
}
```

---

### `/organizations/{orgId}/equipmentAnalytics/summary`
**Aggregated analytics (updated via Cloud Functions)**

```json
{
  // Inventory Summary
  "totalAssets": 87,
  "totalValue": 8750000,  // Sum of bookValue
  "availableCount": 52,
  "checkedOutCount": 28,
  "maintenanceCount": 5,
  "missingCount": 2,
  "retiredCount": 0,
  
  // Category Breakdown
  "categoryBreakdown": {
    "camera": 25,
    "lens": 30,
    "lighting": 15,
    "audio": 10,
    "grip": 5,
    "drone": 2
  },
  
  // Utilization Metrics
  "overallUtilizationRate": 42.5,  // Percentage
  "avgUtilizationPerAsset": 38.2,
  "utilizationTarget": 60,
  "utilizationTrend": "increasing",  // ENUM: increasing, decreasing, stable
  
  // Top/Bottom Performers
  "topUtilizedAssets": [
    {
      "assetId": "ASSET_123",
      "name": "Sony A7III",
      "daysUsed": 280,
      "utilizationRate": 85.3
    }
  ],
  "underutilizedAssets": [
    {
      "assetId": "ASSET_456",
      "name": "Old Canon 5D",
      "daysUsed": 15,
      "utilizationRate": 5.2,
      "recommendation": "Consider selling"
    }
  ],
  
  // Maintenance Metrics (Current Month)
  "monthlyMaintenanceCost": 45000,
  "ytdMaintenanceCost": 385000,
  "avgMaintenanceCostPerAsset": 4425,
  "highMaintenanceAssets": [
    {
      "assetId": "ASSET_789",
      "name": "DJI Mavic Drone",
      "maintenanceCount": 8,
      "totalCost": 65000,
      "downtimePercent": 22
    }
  ],
  
  // External Rental Revenue
  "monthlyExternalRentalRevenue": 125000,
  "ytdExternalRentalRevenue": 987000,
  "topEarningAssets": [
    {
      "assetId": "ASSET_123",
      "name": "Sony A7III",
      "rentalCount": 15,
      "revenue": 87500
    }
  ],
  "externalRentalUtilization": 18.5,  // % of total checkout days
  
  // Crew Performance
  "topCrewByReturns": [
    {
      "uid": "user123",
      "name": "John Doe",
      "onTimeReturnRate": 95.5,
      "averageConditionScore": 4.2,
      "damageIncidents": 0,
      "responsibilityScore": 92
    }
  ],
  
  // Overdue & Issues
  "overdueCount": 3,
  "overdueValue": 125000,
  "avgOverdueDays": 4.3,
  "damageReportsThisMonth": 2,
  "totalDamageValue": 25000,
  
  // Financial
  "totalPurchaseValue": 9500000,  // Original purchase prices
  "currentBookValue": 8750000,
  "totalDepreciation": 750000,
  "insuranceCoverageTotal": 9000000,
  
  // Trends (30-day)
  "utilizationTrend30d": [
    { "date": "2024-09-12", "utilizationRate": 38.5 },
    { "date": "2024-09-19", "utilizationRate": 41.2 },
    { "date": "2024-09-26", "utilizationRate": 43.1 },
    { "date": "2024-10-03", "utilizationRate": 40.8 },
    { "date": "2024-10-10", "utilizationRate": 42.5 }
  ],
  
  // Alerts & Notifications
  "activeAlerts": {
    "maintenanceDue": 7,
    "overdueReturns": 3,
    "batteryReplacement": 4,
    "insuranceExpiring": 2,
    "warrantyExpiring": 5
  },
  
  // Vendor Equipment
  "vendorEquipmentCount": 5,
  "vendorEquipmentCost": 12500,  // Monthly rental cost
  "vendorEquipmentDueBackCount": 2,
  
  // Last Update
  "updatedAt": "2024-10-12T06:00:00Z",
  "nextScheduledUpdate": "2024-10-13T06:00:00Z"
}
```

---

### `/organizations/{orgId}/equipmentVendors/{vendorId}`
**External vendors for borrowed equipment or repairs**

```json
{
  // Identity
  "vendorId": "VND_01HJKM3QRXYZ123ABC",
  "name": "Pro Camera Rentals",
  "type": "rental",  // ENUM: rental, repair, sales
  
  // Contact
  "contactPerson": "Rajesh Kumar",
  "phone": "+919876543210",
  "email": "contact@procamera.com",
  "website": "https://procamera.com",
  
  // Address
  "address": "456 Commercial Street, Bangalore",
  "gps": {
    "latitude": 12.9716,
    "longitude": 77.5946
  },
  
  // Business Details
  "panNumber": "ABCDE1234F",
  "gstNumber": "29ABCDE1234F1Z5",
  "bankDetails": {
    "accountName": "Pro Camera Rentals Pvt Ltd",
    "accountNumber": "1234567890",
    "ifscCode": "HDFC0001234",
    "bankName": "HDFC Bank"
  },
  
  // Terms
  "paymentTerms": "Net 7",
  "preferredPaymentMethod": "bank_transfer",
  "creditLimit": 500000,
  
  // Performance Metrics
  "totalBorrowedAssets": 12,
  "activeBorrowedAssets": 3,
  "totalSpent": 285000,
  "avgDailyRate": 2500,
  "reliabilityScore": 95,
  
  // Status
  "isActive": true,
  "isPreferred": true,
  
  // Audit
  "createdAt": "2024-01-15T10:00:00Z",
  "createdBy": "admin_uid",
  "updatedAt": "2024-10-12T10:00:00Z"
}
```

---

## Indexes Required

```javascript
// Firestore Composite Indexes
[
  {
    collectionGroup: "equipment",
    fields: [
      { fieldPath: "status", order: "ASCENDING" },
      { fieldPath: "category", order: "ASCENDING" },
      { fieldPath: "updatedAt", order: "DESCENDING" }
    ]
  },
  {
    collectionGroup: "checkouts",
    fields: [
      { fieldPath: "uid", order: "ASCENDING" },
      { fieldPath: "checkedOutAt", order: "DESCENDING" }
    ]
  },
  {
    collectionGroup: "checkouts",
    fields: [
      { fieldPath: "actualReturnDate", order: "ASCENDING" },
      { fieldPath: "expectedReturnDate", order: "ASCENDING" }
    ]
  },
  {
    collectionGroup: "maintenance",
    fields: [
      { fieldPath: "status", order: "ASCENDING" },
      { fieldPath: "scheduledDate", order: "ASCENDING" }
    ]
  },
  {
    collectionGroup: "equipment",
    fields: [
      { fieldPath: "utilizationRate", order: "DESCENDING" }
    ]
  }
]
```

---

## Security Considerations

1. **Multi-tenancy**: All queries must filter by `orgId` from custom claims
2. **Role-based access**: 
   - Admins: Full CRUD on all collections
   - Teammates: Read equipment, Create checkouts (self), Update own checkouts
   - Editors: Same as teammates
   - Clients: No direct access (client portal uses backend APIs)
3. **Data validation**: Use Firestore security rules to enforce schema
4. **Audit logging**: All write operations log uid, timestamp in audit fields
5. **Sensitive data**: Financial data (costs, revenue) only visible to admin role

---

## Data Retention Policy

1. **Active Equipment**: Retained indefinitely
2. **Retired Equipment**: Archived but kept for 7 years (tax/audit compliance)
3. **Checkouts**: Retained indefinitely for analytics
4. **Maintenance Records**: Retained for asset lifetime + 3 years
5. **External Rentals**: Retained for 7 years (tax compliance)
6. **Analytics Summary**: Daily snapshots for 90 days, weekly for 2 years

---

This data model supports:
- ✅ Offline-first operations with eventual consistency
- ✅ Real-time status updates via Firestore listeners
- ✅ Comprehensive audit trails
- ✅ Rich analytics and reporting
- ✅ Multi-tenant isolation
- ✅ Scalability to millions of documents
- ✅ Mobile-optimized denormalized queries
