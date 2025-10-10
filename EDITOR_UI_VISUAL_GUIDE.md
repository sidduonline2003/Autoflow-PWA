# Editor UI Visual Guide 🎨

## Overview
This guide shows the new editor-friendly UI for post-production assignments.

## 🎯 Key Differences from Admin View

| Feature | Admin View | Editor View |
|---------|-----------|-------------|
| Layout | Complex, multi-tab | Simple, single-scroll |
| Activity | Hidden in accordion | Prominent timeline |
| Progress | Text-based status | Visual progress bars |
| Data Details | Buried in forms | Front and center |
| Navigation | Multiple sections | Linear flow |
| Design | Professional/Corporate | Modern/Friendly |

## 📱 Full Page Layout

```
╔══════════════════════════════════════════════════════════════╗
║  🏠 Home > My Assignments > Wedding Photography              ║
╠══════════════════════════════════════════════════════════════╣
║                                                               ║
║  📸 Wedding Photography - John & Jane                        ║
║  Status: IN_PROGRESS | Client: John & Jane Wedding          ║
║                                                               ║
║  ┌────────────────────────────────────────────────────────┐ ║
║  │  MY ASSIGNMENTS                                         │ ║
║  ├────────────────────────────────────────────────────────┤ ║
║  │                                                          │ ║
║  │  📸 PHOTO STREAM                                        │ ║
║  │  Role: LEAD EDITOR                                      │ ║
║  │  Team: John Doe (You), Jane Smith                       │ ║
║  │                                                          │ ║
║  │  Progress: [████████████████░░░░] 75%                  │ ║
║  │                                                          │ ║
║  │  Workflow Steps:                                        │ ║
║  │  ✓ Assignment Received                                  │ ║
║  │  ✓ Work Started                                         │ ║
║  │  ✓ Submitted for Review                                 │ ║
║  │  ○ Review Complete                                      │ ║
║  │                                                          │ ║
║  │  📅 Due: Oct 15, 2025 (3 days remaining)               │ ║
║  │                                                          │ ║
║  └────────────────────────────────────────────────────────┘ ║
║                                                               ║
║  ┌────────────────────────────────────────────────────────┐ ║
║  │  📦 DATA STORAGE DETAILS                                │ ║
║  ├────────────────────────────────────────────────────────┤ ║
║  │                                                          │ ║
║  │  Client: John & Jane Wedding                            │ ║
║  │  Total Devices: 3                                       │ ║
║  │  Total Capacity: 512GB                                  │ ║
║  │                                                          │ ║
║  │  📱 Device 1: Canon EOS R5                             │ ║
║  │     • Capacity: 256GB                                   │ ║
║  │     • Location: Main Camera Bag                         │ ║
║  │     • Status: APPROVED                                  │ ║
║  │                                                          │ ║
║  │  📱 Device 2: Sony A7III                               │ ║
║  │     • Capacity: 128GB                                   │ ║
║  │     • Location: Backup Camera                           │ ║
║  │     • Status: APPROVED                                  │ ║
║  │                                                          │ ║
║  │  📱 Device 3: DJI Mavic Pro                            │ ║
║  │     • Capacity: 128GB                                   │ ║
║  │     • Location: Drone Case                              │ ║
║  │     • Status: APPROVED                                  │ ║
║  │                                                          │ ║
║  └────────────────────────────────────────────────────────┘ ║
║                                                               ║
║  ┌────────────────────────────────────────────────────────┐ ║
║  │  📝 ACTIVITY TIMELINE                                   │ ║
║  ├────────────────────────────────────────────────────────┤ ║
║  │                                                          │ ║
║  │  📤 SUBMIT - 10 minutes ago                            │ ║
║  │     Oct 11, 2025 • 3:45 PM                             │ ║
║  │     ─────────────────────────────                       │ ║
║  │     Draft version submitted for review                  │ ║
║  │                                                          │ ║
║  │     📎 Deliverables:                                    │ ║
║  │     • Preview: drive.google.com/...                     │ ║
║  │     • Draft: wetransfer.com/...                         │ ║
║  │                                                          │ ║
║  │     💬 "Initial color grading complete. Please review   │ ║
║  │        the warm tones adjustment."                      │ ║
║  │                                                          │ ║
║  ├────────────────────────────────────────────────────────┤ ║
║  │                                                          │ ║
║  │  📝 NOTE - 1 hour ago                                  │ ║
║  │     Oct 11, 2025 • 2:55 PM                             │ ║
║  │     ─────────────────────────────                       │ ║
║  │     Admin added a note:                                 │ ║
║  │                                                          │ ║
║  │     💬 "Please focus on warm tones for the sunset      │ ║
║  │        shots. Client specifically requested this."      │ ║
║  │                                                          │ ║
║  ├────────────────────────────────────────────────────────┤ ║
║  │                                                          │ ║
║  │  📈 START - 2 hours ago                                │ ║
║  │     Oct 11, 2025 • 1:55 PM                             │ ║
║  │     ─────────────────────────────                       │ ║
║  │     John Doe started work on photo stream               │ ║
║  │                                                          │ ║
║  ├────────────────────────────────────────────────────────┤ ║
║  │                                                          │ ║
║  │  📋 ASSIGN - 3 hours ago                               │ ║
║  │     Oct 11, 2025 • 12:55 PM                            │ ║
║  │     ─────────────────────────────                       │ ║
║  │     Photo stream assigned to:                           │ ║
║  │                                                          │ ║
║  │     👤 John Doe (LEAD)                                 │ ║
║  │     👤 Jane Smith (ASSIST)                             │ ║
║  │                                                          │ ║
║  │     📅 Draft Due: Oct 13, 2025                         │ ║
║  │     📅 Final Due: Oct 15, 2025                         │ ║
║  │                                                          │ ║
║  │     📦 Storage Data: 3 devices assigned                │ ║
║  │                                                          │ ║
║  ├────────────────────────────────────────────────────────┤ ║
║  │                                                          │ ║
║  │  📅 INIT - 4 hours ago                                 │ ║
║  │     Oct 11, 2025 • 11:55 AM                            │ ║
║  │     ─────────────────────────────                       │ ║
║  │     Post-production job initialized                     │ ║
║  │                                                          │ ║
║  │     Event: Wedding Photography - John & Jane            │ ║
║  │     Created by: Admin User                              │ ║
║  │                                                          │ ║
║  └────────────────────────────────────────────────────────┘ ║
║                                                               ║
╚══════════════════════════════════════════════════════════════╝
```

## 🎨 Component Breakdown

### 1. Header Section
```
┌──────────────────────────────────────────────────┐
│  📸 Wedding Photography - John & Jane           │
│  Status: IN_PROGRESS | Client: John & Jane      │
└──────────────────────────────────────────────────┘
```
- Large, clear event title with icon
- Status chip with color coding
- Client name prominently displayed

### 2. Assignment Card
```
┌──────────────────────────────────────────────────┐
│  MY ASSIGNMENTS                                   │
├──────────────────────────────────────────────────┤
│  📸 PHOTO STREAM                                 │
│  Role: LEAD EDITOR                               │
│  Team: John Doe (You), Jane Smith                │
│                                                   │
│  Progress: [████████████████░░░░] 75%           │
│                                                   │
│  Workflow Steps:                                 │
│  ✓ Assignment Received                           │
│  ✓ Work Started                                  │
│  ✓ Submitted for Review                          │
│  ○ Review Complete                               │
│                                                   │
│  📅 Due: Oct 15, 2025 (3 days remaining)        │
└──────────────────────────────────────────────────┘
```

**Features:**
- Stream type with icon (📸 Photo / 🎥 Video)
- User's role prominently displayed
- Team member list
- Visual progress bar (0-100%)
- Stepper showing workflow stages
- Due date with countdown

### 3. Data Storage Details Card
```
┌──────────────────────────────────────────────────┐
│  📦 DATA STORAGE DETAILS                         │
├──────────────────────────────────────────────────┤
│  Client: John & Jane Wedding                     │
│  Total Devices: 3                                │
│  Total Capacity: 512GB                           │
│                                                   │
│  📱 Device 1: Canon EOS R5                      │
│     • Capacity: 256GB                            │
│     • Location: Main Camera Bag                  │
│     • Status: APPROVED ✓                         │
└──────────────────────────────────────────────────┘
```

**Features:**
- Clear summary at top (client, devices, capacity)
- Expandable device details
- Device icon, name, and model
- Storage capacity
- Physical location
- Approval status with checkmark

### 4. Activity Timeline
```
┌──────────────────────────────────────────────────┐
│  📝 ACTIVITY TIMELINE                            │
├──────────────────────────────────────────────────┤
│  📤 SUBMIT - 10 minutes ago                     │
│     Oct 11, 2025 • 3:45 PM                      │
│     ─────────────────────────────                │
│     Draft version submitted for review           │
│                                                   │
│     📎 Deliverables:                             │
│     • Preview: drive.google.com/...              │
│                                                   │
│     💬 "Initial color grading complete"          │
└──────────────────────────────────────────────────┘
```

**Features:**
- Icon-based activity indicators
- Relative time ("10 minutes ago")
- Full timestamp on second line
- Activity description
- Expandable details (deliverables, notes)
- Message/comment display
- Reverse chronological order (newest first)

## 🎯 Color Coding

### Status Colors
- 🔵 **Primary (Blue)** - `#1976d2` - Assigned, In Progress
- 🟢 **Success (Green)** - `#2e7d32` - Submitted, Complete
- 🟡 **Warning (Orange)** - `#ed6c02` - Reassigned, Changes Needed
- 🔴 **Error (Red)** - `#d32f2f` - Blocked, Issues
- ⚫ **Default (Gray)** - `#757575` - Notes, General

### Progress Bar Colors
```css
0-25%:    #d32f2f (Red)    - Just started
25-50%:   #ed6c02 (Orange) - In progress
50-75%:   #1976d2 (Blue)   - Good progress
75-100%:  #2e7d32 (Green)  - Nearly done
```

## 📱 Responsive Behavior

### Desktop (> 1200px)
- Two-column layout
- Wide activity cards
- Full timestamp visible
- All details expanded

### Tablet (768px - 1200px)
- Single column layout
- Compact activity cards
- Relative timestamps
- Collapsible details

### Mobile (< 768px)
- Stacked layout
- Minimal padding
- Icons only for actions
- Swipe to expand details

## 🎬 Animations

### On Load
1. Header fades in from top
2. Assignment card slides in from left
3. Data details slide in from right
4. Activity timeline fades in from bottom

### On Scroll
- Smooth scroll behavior
- Sticky header on scroll
- Progress bar updates

### On Interaction
- Hover effects on cards (elevation increase)
- Click ripple on buttons
- Smooth expand/collapse animations
- Loading spinners for data fetch

## 🔧 Interactive Elements

### Activity Items
```javascript
// Click to expand/collapse details
onClick={() => setExpanded(!expanded)}

// Shows:
- Full deliverable links
- Complete message/notes
- All participants
- Detailed timestamps
```

### Progress Bar
```javascript
// Tooltip shows exact percentage on hover
<Tooltip title="75% Complete" />

// Color changes based on progress
color={progress > 75 ? 'success' : progress > 50 ? 'primary' : 'warning'}
```

### Device Cards
```javascript
// Expandable to show all device details
<Accordion>
  <AccordionSummary>Device 1: Canon EOS R5</AccordionSummary>
  <AccordionDetails>
    • Capacity: 256GB
    • Location: Main Camera Bag
    • Status: APPROVED
    • Files: 1,234
    • Last Updated: Oct 11, 2025
  </AccordionDetails>
</Accordion>
```

## 💡 User Experience Flow

### 1. Editor Opens Job
1. Sees clear event title and client
2. Immediately understands their role (LEAD/ASSIST)
3. Sees progress at a glance

### 2. Editor Checks Status
1. Looks at progress bar (visual feedback)
2. Checks workflow stepper (current stage)
3. Notes due date countdown

### 3. Editor Reviews Data
1. Expands data details card
2. Sees all assigned devices
3. Notes physical locations for retrieval

### 4. Editor Reviews History
1. Scrolls through activity timeline
2. Reads latest updates first
3. Expands for full details if needed

### 5. Editor Takes Action
1. Clicks appropriate action button
2. Completes workflow step
3. Sees immediate UI update

## 📊 Information Hierarchy

```
Level 1 (Most Important)
  ↓ Event Title + Status
  ↓ Progress Bar
  
Level 2 (Important)
  ↓ Due Date
  ↓ Workflow Steps
  ↓ Latest Activity
  
Level 3 (Context)
  ↓ Team Members
  ↓ Data Details
  ↓ Full Activity Log
  
Level 4 (Details)
  ↓ Timestamps
  ↓ Deliverable Links
  ↓ Device Specs
```

## ✅ Accessibility Features

- ♿ **Keyboard Navigation** - Tab through all elements
- 🔊 **Screen Reader Support** - ARIA labels on all components
- 🎨 **High Contrast** - WCAG AA compliant colors
- 📏 **Large Touch Targets** - Minimum 44x44px buttons
- 🔤 **Readable Fonts** - 16px minimum body text
- ⏱️ **Timeout Warnings** - For auto-refresh features

## 🚀 Performance

- 🎯 **Lazy Loading** - Activity items load on scroll
- 🔄 **Optimistic Updates** - UI updates before API confirmation
- 💾 **Local Caching** - Recent data cached for offline viewing
- ⚡ **Fast Render** - Virtual scrolling for long activity lists

---

**This UI design prioritizes clarity, simplicity, and ease of use for editors who need to quickly understand their assignments and track progress.**
