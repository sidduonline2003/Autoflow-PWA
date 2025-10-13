# Equipment Bulk Upload - User Guide 📤

**Date:** October 13, 2025  
**Feature:** Bulk Equipment Upload via CSV  
**User Role:** Admin Only

---

## 🎯 Overview

The Bulk Upload feature allows administrators to add hundreds or thousands of equipment items to the inventory system at once using a CSV (Comma-Separated Values) file. This is perfect for:

- ✅ **Initial Setup** - Import your entire equipment inventory when first setting up the system
- ✅ **Large Purchases** - Add multiple new equipment items from a single purchase order
- ✅ **Migrations** - Transfer equipment data from another system
- ✅ **Batch Updates** - Create many similar equipment items with different serial numbers

---

## 🚀 Quick Start Guide

### Step 1: Access Bulk Upload
1. Log in as an **Admin**
2. Navigate to **Equipment Dashboard** (`/equipment`)
3. Click the **"Bulk Upload"** button in the top action bar

### Step 2: Download Template
1. On the Bulk Upload page, click **"Download CSV Template"**
2. The template file `equipment_bulk_upload_template.csv` will download automatically
3. Open the file in Excel, Google Sheets, or any spreadsheet application

### Step 3: Fill in Your Data
1. **Keep the header row** (first row) as is
2. Fill in your equipment details starting from **row 2**
3. Each row represents one piece of equipment
4. See the [CSV Format Guide](#csv-format-guide) below for detailed field information

### Step 4: Save as CSV
1. **File → Save As → CSV (Comma delimited) (.csv)**
2. Make sure the file extension is `.csv`
3. Do NOT save as Excel (.xlsx) or other formats

### Step 5: Upload Your File
1. Return to the Bulk Upload page
2. **Drag & drop** your CSV file into the upload area, OR
3. **Click** the upload area to browse and select your file
4. Review the selected file name and size
5. Click **"Upload Equipment"** button

### Step 6: Review Results
1. Wait for the upload to complete (progress bar will show)
2. Review the upload summary:
   - ✅ **Successfully Created** - Equipment added to inventory
   - ❌ **Failed** - Errors that need to be fixed
   - 📊 **Total Rows** - Total items processed
3. If there are errors, review the error list and fix your CSV
4. Click created Asset IDs to view the newly added equipment
5. Click **"Upload Another File"** to process more, or **"View Equipment Dashboard"** to see all inventory

---

## 📋 CSV Format Guide

### Required Fields ⚠️

These fields **MUST** be filled for every row:

| Field | Description | Example |
|-------|-------------|---------|
| **name** | Equipment name | `Canon EOS R5` |
| **category** | Equipment category (see valid options below) | `camera` |

### Optional Fields

These fields are optional but highly recommended:

| Field | Description | Format/Example |
|-------|-------------|----------------|
| **description** | Detailed description | `Full-frame mirrorless camera` |
| **manufacturer** | Brand/maker | `Canon` |
| **model** | Model number | `EOS R5` |
| **serialNumber** | Unique serial number | `12345ABC` |
| **purchaseDate** | Date purchased | `2024-01-15` (YYYY-MM-DD) |
| **purchasePrice** | Purchase price in dollars | `3499.99` |
| **location** | Where it's stored | `Studio A` |
| **condition** | Current condition (see valid options below) | `excellent` |
| **notes** | Additional notes | `Primary event camera` |

---

## 📊 Valid Values

### Categories (Required)

Choose ONE of these for the `category` field:

| Category | Use For |
|----------|---------|
| `camera` | DSLR, mirrorless, cinema cameras |
| `lens` | Camera lenses of all types |
| `lighting` | Lights, strobes, LED panels |
| `audio` | Microphones, recorders, mixers |
| `tripod` | Tripods, monopods, stands |
| `gimbal` | Camera stabilizers, gimbals |
| `drone` | Aerial photography drones |
| `monitor` | External monitors, field monitors |
| `storage` | Memory cards, hard drives, cases |
| `other` | Any other equipment type |

### Conditions (Optional)

Choose ONE of these for the `condition` field:

| Condition | Meaning |
|-----------|---------|
| `excellent` | Like new, perfect working order |
| `good` | Minor wear, fully functional |
| `fair` | Visible wear, but works fine |
| `poor` | Significant wear, may need attention |
| `needs_repair` | Not working, needs repair |

**Default:** If left blank, defaults to `good`

---

## 📝 Sample CSV Content

```csv
name,category,description,manufacturer,model,serialNumber,purchaseDate,purchasePrice,location,condition,notes
Canon EOS R5,camera,Full-frame mirrorless camera,Canon,EOS R5,12345ABC,2024-01-15,3499.99,Studio A,excellent,Primary event camera
Sony A7 III,camera,Professional mirrorless camera,Sony,Alpha 7 III,SONY67890,2023-06-20,1999.99,Studio B,good,Backup camera with extra battery
Manfrotto MT055XPRO3,tripod,Aluminum tripod with ball head,Manfrotto,MT055XPRO3,MF12345,2023-03-10,299.99,Equipment Room,excellent,Heavy-duty tripod
Rode VideoMic Pro,audio,Shotgun microphone,Rode,VideoMic Pro,RODE789,2024-02-01,229.99,Audio Cabinet,excellent,Comes with deadcat windscreen
Godox AD600Pro,lighting,Portable strobe light,Godox,AD600Pro,GX456789,2023-11-15,899.99,Lighting Room,good,Includes battery and charger
```

---

## ✅ Best Practices

### 1. **Start Small**
- Test with 5-10 items first
- Verify they upload correctly
- Then upload the full batch

### 2. **Use Consistent Naming**
- Keep naming conventions consistent
- Example: "Canon EOS R5" not "Canon EOS-R5" or "canon eos r5"

### 3. **Serial Numbers**
- Always include serial numbers when available
- Makes equipment tracking much easier
- Helps with warranty and insurance claims

### 4. **Categories**
- Use correct category for better organization
- Affects filtering and reporting
- Use `other` only when no category fits

### 5. **Dates Format**
- Always use `YYYY-MM-DD` format
- Example: `2024-01-15` for January 15, 2024
- Other formats will cause errors

### 6. **Prices**
- Use numbers only (no currency symbols)
- Example: `3499.99` not `$3,499.99`
- Decimals are allowed

### 7. **Special Characters**
- Avoid special characters in text fields when possible
- If needed, use standard punctuation (periods, commas, hyphens)
- Quotes inside text should be escaped properly

---

## ⚠️ Common Errors & Solutions

### Error: "Name is required"
**Problem:** The `name` field is empty  
**Solution:** Fill in the equipment name for that row

### Error: "Category is required"
**Problem:** The `category` field is empty  
**Solution:** Choose a valid category from the list above

### Error: "Invalid category 'xyz'"
**Problem:** Category doesn't match valid options  
**Solution:** Use exactly one of: camera, lens, lighting, audio, tripod, gimbal, drone, monitor, storage, other

### Error: "Invalid condition 'xyz'"
**Problem:** Condition doesn't match valid options  
**Solution:** Use one of: excellent, good, fair, poor, needs_repair (or leave blank for 'good')

### Error: "Invalid purchase date"
**Problem:** Date format is wrong  
**Solution:** Use YYYY-MM-DD format (e.g., 2024-01-15)

### Error: "Invalid purchase price"
**Problem:** Price contains non-numeric characters  
**Solution:** Use numbers only, with decimal if needed (e.g., 3499.99)

### Error: "Missing required columns"
**Problem:** CSV header row is missing or modified  
**Solution:** Re-download template and copy your data into it

---

## 🔧 Technical Details

### What Happens During Upload?

1. **File Validation**
   - Checks file is CSV format
   - Validates required columns exist
   - Confirms header row is correct

2. **Row Processing**
   - Each row is processed individually
   - Validates all required fields
   - Checks categories and conditions against valid lists
   - Parses dates and prices

3. **Equipment Creation**
   - Generates unique Asset ID (e.g., CAMERA_a1b2c3d4)
   - Creates QR code automatically
   - Uploads QR code to cloud storage
   - Saves to database

4. **Result Summary**
   - Shows success/failure counts
   - Lists all created Asset IDs
   - Details any errors with row numbers

### Generated Fields

These fields are automatically generated (don't include in CSV):

- **assetId** - Unique identifier (e.g., CAMERA_a1b2c3d4)
- **qrCodeUrl** - Public URL to QR code image
- **status** - Always starts as "available"
- **createdAt** - Upload timestamp
- **createdBy** - Your admin user ID

---

## 📸 Visual Guide

### 1. Equipment Dashboard - Bulk Upload Button
```
┌─────────────────────────────────────────────────────┐
│ Equipment Inventory Dashboard                       │
│                                                     │
│ [Scan QR] [Bulk Upload] [Add Equipment]           │
│                          ^^^^^^^^^^                 │
│                          Click here                 │
└─────────────────────────────────────────────────────┘
```

### 2. Bulk Upload Page - Download Template
```
┌─────────────────────────────────────────────────────┐
│ 📤 Bulk Equipment Upload                            │
│                                                     │
│ ℹ️ How to Use Bulk Upload                          │
│   1. Download the CSV template                     │
│   2. Fill in your equipment details                │
│   3. Save as CSV format                            │
│   4. Upload your CSV file                          │
│                                                     │
│ [Download CSV Template]  ← Click to download       │
└─────────────────────────────────────────────────────┘
```

### 3. Upload Area - Drag & Drop
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                      ☁️                             │
│                                                     │
│        Drag & drop your CSV file here              │
│              or click to browse files              │
│                                                     │
│              equipment_list.csv                    │
│                   [25.43 KB]                       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 4. Results - Success Summary
```
┌─────────────────────────────────────────────────────┐
│ ✅ Upload Complete                                  │
│    Successfully uploaded 5 equipment items!         │
│                                                     │
│ ┌───────┐  ┌───────┐  ┌───────┐                  │
│ │  ✅   │  │  ❌   │  │  ℹ️   │                  │
│ │   5   │  │   0   │  │   5   │                  │
│ │Created│  │Failed │  │ Total │                  │
│ └───────┘  └───────┘  └───────┘                  │
│                                                     │
│ Created Equipment:                                  │
│ [CAMERA_a1b2c3d4] [CAMERA_e5f6g7h8]               │
│ [TRIPOD_i9j0k1l2] [AUDIO_m3n4o5p6]               │
│ [LIGHTING_q7r8s9t0]                               │
└─────────────────────────────────────────────────────┘
```

---

## 🎓 Tips for Large Uploads

### For 100+ Items:

1. **Split into Batches**
   - Upload in groups of 50-100 items
   - Easier to troubleshoot errors
   - Reduces memory usage

2. **Test Each Category Separately**
   - Upload cameras first
   - Then lenses, then lighting, etc.
   - Helps identify category-specific issues

3. **Keep Backup Copy**
   - Save original CSV before uploading
   - Easier to fix errors and re-upload
   - Good for record-keeping

4. **Monitor Progress**
   - Don't close browser during upload
   - Watch for any error messages
   - Note any failed items for correction

5. **Verify After Upload**
   - Check Equipment Dashboard
   - Search for some uploaded items
   - Verify details are correct

---

## 🆘 Troubleshooting

### Template Won't Download
- **Check:** Browser popup blocker settings
- **Solution:** Allow popups for this site

### Upload Button Disabled
- **Check:** File selected and is .csv format
- **Solution:** Ensure you've selected a valid CSV file

### All Items Failed
- **Check:** CSV format and required columns
- **Solution:** Re-download template and copy data into it

### Some Items Failed
- **Check:** Error list for specific row numbers
- **Solution:** Fix those rows and upload again (only failed rows)

### QR Codes Not Generated
- **Check:** Firebase Storage permissions
- **Solution:** Contact system administrator

### Upload Takes Too Long
- **Check:** Number of items (100+ can take time)
- **Solution:** Split into smaller batches

---

## 📞 Support

### Need Help?
- Check error messages carefully - they tell you exactly what's wrong
- Review this guide for format requirements
- Test with the sample data from the template first
- Contact your system administrator if issues persist

### Feature Requests
- Want to upload equipment images?
- Need to update existing equipment?
- Other bulk operations needed?
- Let us know! We're constantly improving the system.

---

## 📊 Appendix: Complete Example

Here's a complete example with all optional fields filled:

```csv
name,category,description,manufacturer,model,serialNumber,purchaseDate,purchasePrice,location,condition,notes
Canon EOS R5,camera,Full-frame mirrorless camera with 45MP sensor,Canon,EOS R5,CAN12345ABC,2024-01-15,3499.99,Studio A,excellent,Primary event camera with extra battery
Sony FE 24-70mm f/2.8 GM,lens,Professional zoom lens for Sony E-mount,Sony,FE 24-70mm f/2.8 GM,SONY24701234,2024-01-15,2198.00,Lens Cabinet A,excellent,Pairs with A7 series cameras
Aputure 300d II,lighting,300W LED light with Bowens mount,Aputure,300d Mark II,APU300D5678,2023-12-10,849.00,Lighting Room,good,Includes barn doors and softbox
Rode NTG3,audio,Professional shotgun microphone,Rode,NTG3,RODE789012,2023-11-20,699.00,Audio Cabinet,excellent,Broadcast quality with Rycote mount
DJI Ronin-S,gimbal,3-axis motorized gimbal stabilizer,DJI,Ronin-S,DJI345678,2023-10-05,549.00,Equipment Room,good,Includes hard case and accessories
DJI Mavic 3 Pro,drone,Professional drone with Hasselblad camera,DJI,Mavic 3 Pro Cine,DJI901234,2024-03-01,4999.00,Drone Locker,excellent,Includes RC Pro controller and fly more kit
Atomos Ninja V,monitor,5-inch HDR monitor recorder,Atomos,Ninja V,ATM567890,2023-09-15,649.00,Monitor Cart,good,Includes SSD and batteries
Manfrotto 502AH,tripod,Video fluid head with 75mm bowl,Manfrotto,502AH,MF123456,2023-08-20,349.99,Equipment Room,fair,Some cosmetic wear but fully functional
SanDisk Extreme PRO 512GB,storage,High-speed CFexpress card,SanDisk,Extreme PRO,SD789012,2024-02-10,399.99,Memory Card Box,excellent,Read speed 1700MB/s
Pelican 1510,storage,Waterproof rolling equipment case,Pelican,1510,PEL345678,2023-07-15,249.95,Storage Area,good,Includes foam inserts
```

---

**Happy Uploading! 🚀**

For questions or issues, contact your system administrator.

*Last Updated: October 13, 2025*
