# Analytics Dashboard - Visual Reference Guide 📊

## Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Dashboard                              [Refresh]     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────┐│
│  │  📊 Total    │ │  💰 Total    │ │  ✅ Available│ │  📈 In │││
│  │  Assets      │ │  Value       │ │              │ │  Use   │││
│  │              │ │              │ │              │ │        │││
│  │     15       │ │  ₹25,00,000  │ │      8       │ │   5    │││
│  │              │ │              │ │  53% of total│ │ 33% ut │││
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────┘│
│                                                                  │
│  ┌──────────────────────────────┐ ┌────────────────────────────┐│
│  │ Equipment Status Distribution│ │ Equipment by Category      ││
│  │                              │ │                            ││
│  │       [PIE CHART]            │ │      [BAR CHART]           ││
│  │                              │ │                            ││
│  │  🟢 Available: 8 (53%)       │ │  Camera    ████████  5     ││
│  │  🔵 Checked Out: 5 (33%)     │ │  Lighting  ██████    3     ││
│  │  🟡 Maintenance: 1 (7%)      │ │  Audio     ████████  4     ││
│  │  🔴 Missing: 0 (0%)          │ │  Misc      ██████    3     ││
│  │  🟣 Retired: 1 (7%)          │ │                            ││
│  └──────────────────────────────┘ └────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Equipment Utilization Trend (Last 30 Days)                  ││
│  │                                                             ││
│  │     [DUAL LINE CHART]                                       ││
│  │  %                                                          ││
│  │  50├─────────────────────────────────────────────          ││
│  │  40│        ╱╲    ╱╲                                        ││
│  │  30│       ╱  ╲  ╱  ╲    ╱╲                                 ││
│  │  20│  ────╱────╲╱────╲──╱──╲────                            ││
│  │  10│                                                        ││
│  │   0└────────────────────────────────────────>              ││
│  │     Oct 6    Oct 13   Oct 20   Oct 27                      ││
│  │                                                             ││
│  │  Legend: ─── Utilization Rate (%)  ─── Assets In Use       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Top Crew Members by Responsibility Score                    ││
│  │                                                             ││
│  │ Rank │ Name      │ Checkouts │ On-Time │ Condition │ Damages││
│  │══════════════════════════════════════════════════════════   ││
│  │  #1  │ John Doe  │    45     │ 92.5% 🟢│   4/5    │  1 🟢  ││
│  │  #2  │ Jane Smith│    38     │ 88.0% 🟢│   5/5    │  0 🟢  ││
│  │  #3  │ Bob Wilson│    32     │ 75.0% 🟡│   3/5    │  2 🟡  ││
│  │  #4  │ Alice Lee │    28     │ 82.5% 🟢│   4/5    │  1 🟢  ││
│  │  #5  │ Mike Chen │    25     │ 60.0% 🟡│   3/5    │  3 🔴  ││
│  │                                                    Score    ││
│  │                                                     85/100  ││
│  │                                                     80/100  ││
│  │                                                     65/100  ││
│  │                                                     70/100  ││
│  │                                                     50/100  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐│
│  │  🔧          │ │  💰          │ │  📁                      ││
│  │  Maintenance │ │  Rental      │ │  Categories              ││
│  │              │ │  Revenue     │ │                          ││
│  │  1 items     │ │  ₹0         │ │  4 categories            ││
│  │  ⚠️ Needs    │ │  This month  │ │  Across all equipment    ││
│  │  attention   │ │              │ │                          ││
│  └──────────────┘ └──────────────┘ └──────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Color Coding Guide

### Status Distribution (Pie Chart)
- 🟢 **Green** (Available): Equipment ready for checkout
- 🔵 **Blue** (Checked Out): Currently in use
- 🟡 **Yellow** (Maintenance): Under repair/servicing
- 🔴 **Red** (Missing): Lost or stolen
- 🟣 **Purple** (Retired): Out of service

### Crew Performance (Table)
- 🟢 **Green Badge**: ≥80% on-time, 0-1 damage incidents
- 🟡 **Yellow Badge**: 50-79% on-time, 1-2 damage incidents
- 🔴 **Red Badge**: <50% on-time, 3+ damage incidents

### Responsibility Score Interpretation
- **90-100**: ⭐ Excellent - Highly reliable crew member
- **70-89**: ✅ Good - Dependable with minor issues
- **50-69**: ⚠️ Fair - Needs improvement
- **0-49**: ❌ Poor - Requires immediate attention

---

## Interactive Features

### Charts
1. **Hover Tooltips**: 
   - Pie chart: Shows exact counts and percentages
   - Bar chart: Shows category names and counts
   - Line chart: Shows date, utilization rate, and assets in use

2. **Responsive Sizing**:
   - Charts auto-resize to container width
   - Mobile: Stacked layout (single column)
   - Tablet: 2-column grid
   - Desktop: Full 2-column layout

### Buttons
- **Back to Dashboard**: Returns to main equipment page
- **Refresh**: Reloads all analytics data

### Error States
- **Loading**: Centered spinner while fetching data
- **Error**: Red alert with error message + Retry button
- **Empty State**: "No data available" messages

---

## Data Refresh Behavior

### Automatic Caching
- **Summary data**: Cached in Firestore (`equipmentAnalytics/summary`)
- **First load**: Calculates and saves to cache
- **Subsequent loads**: Uses cached data (instant response)
- **Cache invalidation**: Manual refresh or after equipment changes

### Manual Refresh
- Click "Refresh" button
- Fetches all 3 endpoints in parallel
- Updates all visualizations simultaneously
- Shows loading spinner during refresh

---

## Mobile View Adjustments

```
┌───────────────┐
│ ← Back  [↻]   │
├───────────────┤
│ 📊 Total      │
│     15        │
├───────────────┤
│ 💰 Value      │
│  ₹25,00,000   │
├───────────────┤
│ ✅ Available  │
│      8        │
├───────────────┤
│ 📈 In Use     │
│      5        │
├───────────────┤
│ Status Chart  │
│  [PIE]        │
├───────────────┤
│ Category Chart│
│  [BAR]        │
├───────────────┤
│ Utilization   │
│  [LINE]       │
├───────────────┤
│ Crew Scores   │
│  [TABLE]      │
├───────────────┤
│ Maintenance   │
│ Rental        │
│ Categories    │
└───────────────┘
```

---

## API Endpoints Used

1. **`GET /api/equipment/analytics/summary`**
   - Fetches: Total assets, values, status breakdown, categories
   - Used by: Summary cards, pie chart, bar chart

2. **`GET /api/equipment/analytics/crew-scores?limit=10`**
   - Fetches: Top 10 crew members with performance metrics
   - Used by: Crew scores table

3. **`GET /api/equipment/analytics/utilization-trend?days=30`**
   - Fetches: 30-day utilization data (weekly intervals)
   - Used by: Utilization trend line chart

---

## Navigation Path

```
Admin Portal Home
    ↓
Equipment Dashboard (/equipment)
    ↓
Analytics Button → Analytics Dashboard (/equipment/analytics)
```

---

## Quick Reference

### Key Metrics Explained

**Total Assets**: Count of all equipment items (any status)

**Total Value**: Sum of `bookValue` field across all equipment

**Available**: Equipment with status = `AVAILABLE`

**In Use**: Equipment with status = `CHECKED_OUT`

**Utilization Rate**: `(In Use / Total Assets) × 100`

**Responsibility Score**: Weighted formula based on:
- 50% on-time return rate
- 30% equipment condition on return
- 20% damage incident penalty

**Condition Score**: 
- 5 = Excellent (90%+ good returns)
- 4 = Very Good (70-89% good returns)
- 3 = Good (50-69% good returns)
- 2 = Fair (<50% good returns)

---

## Best Practices for Admins

1. **Review Weekly**: Check utilization trends every Monday
2. **Track Top Performers**: Recognize crew members with 85+ scores
3. **Address Low Scores**: Coach crew members below 50
4. **Monitor Damages**: Investigate patterns in damage incidents
5. **Optimize Inventory**: Retire underutilized equipment
6. **Budget Planning**: Use total value for insurance/replacement planning

---

## Troubleshooting

**Dashboard not loading?**
- Check network tab: Should see 3 API calls (summary, crew-scores, utilization-trend)
- Verify 200 OK responses
- Check console for error messages

**No crew scores showing?**
- Verify there are completed checkouts with return data
- Check that users have `userName` field populated
- Ensure `actualReturnDate` is set on returned items

**Utilization trend flat line?**
- Confirm active/historical checkouts exist
- Verify `checkoutDate` and `expectedReturnDate` are set
- Check date range (default 30 days)

**403 Forbidden errors?**
- User must have `role: "admin"` in Firebase Auth custom claims
- Verify JWT token is valid and not expired

---

This visual guide complements the technical implementation document for complete reference! 🎨📊
