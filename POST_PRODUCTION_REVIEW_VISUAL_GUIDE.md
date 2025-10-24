# Post-Production Review System - Visual Implementation Guide

## 🎨 Complete Visual Walkthrough

This guide provides detailed visual descriptions of every screen and interaction in the post-production review system.

---

## 📱 Main Review Dashboard

### Layout Overview
```
┌──────────────────────────────────────────────────────────────┐
│  Post-Production Reviews                    [+ New Review]    │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Pending  │  │In Progress│  │Avg Time  │  │Resolved  │    │
│  │   12 ↑12%│  │    5 ↓5% │  │ 2.3 hrs  │  │   8 ↑8%  │    │
│  │   🟡     │  │    🔵    │  │    ⏱️    │  │    ✅    │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│                                                                │
├──────────────────────────────────────────────────────────────┤
│  🔍 Search reviews...                               [🎛️ Filters]│
│                                                                │
│  [All] [Pending] [In Progress] [Resolved] [Escalated]        │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │█ 👤 Sarah Admin [Admin Badge]          [Pending Badge]│ │
│  │  "2 minutes ago" 🕐                                    │ │
│  │────────────────────────────────────────────────────────│ │
│  │ Please adjust the color grading in scenes 3-5.        │ │
│  │ The outdoor shots need warmer tones.                   │ │
│  │                                                         │ │
│  │ 📅 Event: Wedding Ceremony                            │ │
│  │ [REVISION REQUEST]                                     │ │
│  │                                                         │ │
│  │ [Image Grid: 3 thumbnails]                            │ │
│  │────────────────────────────────────────────────────────│ │
│  │ [Reply (2)] [Mark Resolved] [•••]                     │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │██ 👤 Mike Editor [Editor Badge]     [In Progress Badge]│ │
│  │   "1 hour ago" 🕐                                      │ │
│  │────────────────────────────────────────────────────────│ │
│  │ Working on the audio synchronization now.              │ │
│  │ Should be complete by end of day.                      │ │
│  │                                                         │ │
│  │ 📅 Event: Corporate Event                             │ │
│  │ [COMMENT]                                              │ │
│  │────────────────────────────────────────────────────────│ │
│  │ [Reply] [Mark Resolved] [•••]                         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │███ 👤 Client Name [Client Badge]       [Escalated Badge]│ │
│  │    "Yesterday at 3:45 PM" 🕐                          │ │
│  │────────────────────────────────────────────────────────│ │
│  │ URGENT: Final cuts missing several key moments.        │ │
│  │ Need immediate review before delivery.                 │ │
│  │                                                         │ │
│  │ 📅 Event: Product Launch                              │ │
│  │ [REJECTION] 🎬 video-file.mp4                         │ │
│  │────────────────────────────────────────────────────────│ │
│  │ [Reply (5)] [Mark Resolved] [•••]                     │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                                │
│               Loading more... 🔄                              │
│                                                                │
└──────────────────────────────────────────────────────────────┘

Legend:
█   = Low Priority (3px gray border)
██  = Medium Priority (4px orange border)
███ = High Priority (5px deep orange border)
████ = URGENT Priority (6px RED PULSING border)
```

---

## 🎨 Color Palette Reference

### Status Colors
```
┌─────────────────────────────────────────┐
│ Pending Status                          │
│ Background: #FFF9E6 (Light Yellow)      │
│ Border: #FFD700 (Gold)                  │
│ Icon: #F59E0B (Amber)                   │
│ Label: "Pending"                        │
├─────────────────────────────────────────┤
│ In Progress Status                      │
│ Background: #E6F7FF (Light Blue)        │
│ Border: #1890FF (Blue)                  │
│ Icon: #1890FF (Blue)                    │
│ Label: "In Progress"                    │
├─────────────────────────────────────────┤
│ Resolved Status                         │
│ Background: #E8F5E9 (Light Green)       │
│ Border: #4CAF50 (Green)                 │
│ Icon: #4CAF50 (Green)                   │
│ Label: "Resolved"                       │
├─────────────────────────────────────────┤
│ Escalated Status                        │
│ Background: #FFEBEE (Light Red)         │
│ Border: #F44336 (Red)                   │
│ Icon: #F44336 (Red)                     │
│ Label: "Escalated"                      │
└─────────────────────────────────────────┘
```

### Priority Indicators
```
Low:     ║   3px Gray (#9E9E9E)
Medium:  ║║  4px Orange (#FF9800)
High:    ║║║ 5px Deep Orange (#FF5722)
Urgent:  ║║║ 6px RED (#D32F2F) + PULSE ANIMATION
         ⚡
```

---

## 💬 Review Card States

### Default State
```
┌────────────────────────────────────────┐
│█ 👤 User Name [Role]      [Status]    │
│  Time stamp                             │
├────────────────────────────────────────┤
│ Review content text...                  │
│                                         │
│ 📅 Event: Event Name                   │
│ [TYPE BADGE]                            │
├────────────────────────────────────────┤
│ [Reply] [Mark Resolved] [•••]          │
└────────────────────────────────────────┘
Shadow: elevation 2
```

### Hover State
```
┌────────────────────────────────────────┐
│█ 👤 User Name [Role]      [Status]    │  ⬆️ Lifted 2px
│  Time stamp                             │
├────────────────────────────────────────┤
│ Review content text...                  │
│                                         │
│ 📅 Event: Event Name                   │
│ [TYPE BADGE]                            │
├────────────────────────────────────────┤
│ [Reply] [Mark Resolved] [•••]          │
└────────────────────────────────────────┘
Shadow: elevation 6 (deeper shadow)
Transform: translateY(-2px)
```

### With Thread Expanded
```
┌────────────────────────────────────────┐
│█ 👤 User Name [Role]      [Status]    │
│  Time stamp                             │
├────────────────────────────────────────┤
│ Review content text...                  │
│                                         │
│ 📅 Event: Event Name                   │
│ [TYPE BADGE]                            │
├────────────────────────────────────────┤
│ [Reply (2)] [Mark Resolved] [🔼]       │
├────────────────────────────────────────┤
│    ├─ 👤 Reply Author                  │
│    │   "5 minutes ago"                  │
│    │   Reply text here...               │
│    │                                    │
│    ├─ 👤 Another Author                │
│    │   "10 minutes ago"                 │
│    │   Another reply...                 │
│    │                                    │
│    └─ [Type your reply...] [Send →]    │
└────────────────────────────────────────┘
```

---

## 🎛️ Filters Panel

### Desktop View (Dropdown Menu)
```
┌─────────────────────────────────┐
│ 🎛️ Filters (2)                  │
├─────────────────────────────────┤
│                                  │
│ Priority                         │
│ ┌─────────────────────────────┐ │
│ │ ☑ Low    ☑ Medium          │ │
│ │ ☐ High   ☐ Urgent           │ │
│ └─────────────────────────────┘ │
│                                  │
│ Reviewer Role                    │
│ ┌─────────────────────────────┐ │
│ │ ☐ Admin                      │ │
│ │ ☐ Editor                     │ │
│ │ ☐ Client                     │ │
│ └─────────────────────────────┘ │
│                                  │
│ Event                            │
│ ┌─────────────────────────────┐ │
│ │ [Select Event ▼]            │ │
│ └─────────────────────────────┘ │
│                                  │
│ Assigned To                      │
│ ┌─────────────────────────────┐ │
│ │ [Select User ▼]             │ │
│ └─────────────────────────────┘ │
│                                  │
│ [Clear All Filters]              │
│                                  │
└─────────────────────────────────┘
```

### Mobile View (Bottom Drawer)
```
Full Screen Overlay
┌─────────────────────────────────┐
│                                  │
│              [─]  ← Swipe down   │
│                                  │
│  🎛️ Filters                      │
│                                  │
│  Priority                        │
│  [Low] [Medium] [High] [Urgent] │
│                                  │
│  Reviewer Role                   │
│  [Admin] [Editor] [Client]      │
│                                  │
│  Event                           │
│  [Select Event ▼]               │
│                                  │
│  Assigned To                     │
│  [Select User ▼]                │
│                                  │
│  [Clear All Filters]             │
│                                  │
└─────────────────────────────────┘
```

---

## 📊 Analytics Cards

### Card Design
```
┌──────────────────────────────────┐
│  Pending Reviews          🟡    │
│                                  │
│         12                       │
│                                  │
│  ↑ 12% vs last week             │
└──────────────────────────────────┘
Background: #FFF9E6
Border: #FFD700
Icon Background: White circle

┌──────────────────────────────────┐
│  In Progress              🔵    │
│                                  │
│          5                       │
│                                  │
│  ↓ 5% vs last week              │
└──────────────────────────────────┘
Background: #E6F7FF
Border: #1890FF
Icon Background: White circle

┌──────────────────────────────────┐
│  Avg Response Time        ⏱️    │
│                                  │
│       2.3 hrs                    │
│                                  │
│  ↓ 18% vs last week             │
└──────────────────────────────────┘
Background: #E8F5E9
Border: #4CAF50
Icon Background: White circle

┌──────────────────────────────────┐
│  Resolved Today           ✅    │
│                                  │
│          8                       │
│                                  │
│  ↑ 8% vs last week              │
└──────────────────────────────────┘
Background: #E8F5E9
Border: #4CAF50
Icon Background: White circle
```

### Hover Effect
- Card lifts 4px upward
- Shadow increases to elevation 3
- Smooth 0.3s transition

---

## 📝 Create Review Dialog

```
┌──────────────────────────────────────────┐
│  Create New Review               [✕]     │
├──────────────────────────────────────────┤
│                                           │
│  Event ID                                 │
│  ┌─────────────────────────────────────┐ │
│  │ evt_12345                           │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  Event Name                               │
│  ┌─────────────────────────────────────┐ │
│  │ Wedding Ceremony                    │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  Review Type                              │
│  ┌─────────────────────────────────────┐ │
│  │ Revision Request ▼                  │ │
│  └─────────────────────────────────────┘ │
│  Options: Approval, Revision Request,    │
│           Comment, Rejection              │
│                                           │
│  Priority                                 │
│  ┌─────────────────────────────────────┐ │
│  │ High ▼                              │ │
│  └─────────────────────────────────────┘ │
│  Options: Low, Medium, High, Urgent      │
│                                           │
│  Content                                  │
│  ┌─────────────────────────────────────┐ │
│  │ Please adjust the color grading... │ │
│  │                                     │ │
│  │                                     │ │
│  └─────────────────────────────────────┘ │
│                                           │
│           [Cancel]  [Create]              │
│                                           │
└──────────────────────────────────────────┘
```

---

## 💬 Reply Dialog

```
┌──────────────────────────────────────────┐
│  Reply to Review                 [✕]     │
├──────────────────────────────────────────┤
│                                           │
│  Your Reply                               │
│  ┌─────────────────────────────────────┐ │
│  │ I've made the requested changes... │ │
│  │                                     │ │
│  │                                     │ │
│  │                                     │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  📎 Attach files (optional)              │
│  ┌─────────────────────────────────────┐ │
│  │ [Click to upload or drag & drop]   │ │
│  └─────────────────────────────────────┘ │
│                                           │
│           [Cancel]  [Send Reply]          │
│                                           │
└──────────────────────────────────────────┘
```

---

## 📱 Mobile Layout Differences

### Review Card (Mobile)
```
┌─────────────────────────────┐
│█ 👤 User        [Status]   │
│  2m ago                      │
├─────────────────────────────┤
│ Review content...            │
│                              │
│ 📅 Event Name               │
│ [TYPE]                       │
├─────────────────────────────┤
│ [Reply]  [Resolve]          │
│              [•••]          │
└─────────────────────────────┘
```

### Floating Action Button
```
                  ┌───┐
                  │ + │ ← Bottom right corner
                  └───┘
                 Floating
                 Creates new review
```

### Filter Drawer (Swipe Up)
```
Swipes up from bottom
Covers 60% of screen
Dismiss by swiping down or tapping outside
```

---

## 🎭 Interaction Animations

### Priority Pulse (Urgent Only)
```
Frame 1: ║║║ Opacity 1.0
Frame 2: ║║║ Opacity 0.5  (0.5s)
Frame 3: ║║║ Opacity 1.0  (1.0s)
Repeat infinitely
```

### Card Hover
```
State Change: Default → Hover
Duration: 0.3s
Easing: ease-in-out

Properties:
- transform: translateY(0) → translateY(-2px)
- box-shadow: elevation-2 → elevation-6
```

### Thread Expand/Collapse
```
State Change: Collapsed → Expanded
Duration: 0.4s
Easing: auto (Material-UI default)

Animation:
- Height: 0 → auto
- Opacity: 0 → 1
```

### Skeleton Loader
```
┌─────────────────────────────┐
│ ▓▓▓▓░░░░░░░░░░░░░░░░░░     │ ← Shimmer effect
│ ▓▓░░░░░░░░░░░░░░░░░░░░     │   Moving gradient
│ ▓▓▓▓▓▓░░░░░░░░░░░░░░░░     │   Left to right
│ ▓▓▓░░░░░░░░░░░░░░░░░░░     │
└─────────────────────────────┘
Duration: 1.5s
Repeat: infinite
```

---

## 🎨 Typography Hierarchy

### Desktop
```
Page Title:        32px / Bold / #333333
Section Headers:   24px / Semi-bold / #333333
Card Headers:      16px / Bold / #333333
Body Text:         14px / Regular / #666666
Timestamps:        12px / Regular / #999999
Badges:            11px / Bold / Various
```

### Mobile
```
Page Title:        24px / Bold / #333333
Section Headers:   18px / Semi-bold / #333333
Card Headers:      14px / Bold / #333333
Body Text:         13px / Regular / #666666
Timestamps:        11px / Regular / #999999
Badges:            10px / Bold / Various
```

---

## 🎯 Touch Targets (Mobile)

All interactive elements meet minimum touch target size:

```
Minimum Size: 44x44 pixels

✅ Buttons: 48x36 pixels (minimum)
✅ Icon Buttons: 48x48 pixels
✅ Chips: 32x24 pixels (with padding)
✅ Tab Buttons: Width varies, 48px height
✅ Cards: Full width, 200px+ height
```

---

## 📐 Spacing System

### Card Spacing
```
Internal Padding: 16px all sides
Gap between cards: 24px vertical
Border Radius: 12px
Border Width: 1px
```

### Layout Spacing
```
Page Padding: 32px (desktop), 16px (mobile)
Section Gaps: 32px (desktop), 24px (mobile)
Element Gaps: 16px (default), 8px (compact)
```

---

## 🎨 Attachment Display

### Image Grid (3 images)
```
┌─────────┬─────────┬─────────┐
│ Image 1 │ Image 2 │ Image 3 │
│  120px  │  120px  │  120px  │
│ height  │ height  │ height  │
└─────────┴─────────┴─────────┘
Gap: 8px between images
Border Radius: 8px
Clickable: Opens in new tab
```

### Document/Video Attachments
```
┌───────────────────────────────┐
│ 📄 document-name.pdf  [⬇️]   │
│    2.3 MB                      │
└───────────────────────────────┘
Height: 48px
Padding: 8px
Border: 1px solid divider
Hover: Background changes to action.hover
```

---

## 🔔 Toast Notifications

### Success
```
┌──────────────────────────────┐
│ ✅ Review marked as resolved │
└──────────────────────────────┘
Background: #4CAF50
Color: White
Duration: 3 seconds
Position: Top-right
```

### Error
```
┌──────────────────────────────┐
│ ❌ Failed to create review   │
└──────────────────────────────┘
Background: #F44336
Color: White
Duration: 4 seconds
Position: Top-right
```

### Info
```
┌──────────────────────────────┐
│ ℹ️ Loading more reviews...   │
└──────────────────────────────┘
Background: #2196F3
Color: White
Duration: 2 seconds
Position: Top-right
```

---

## ⌨️ Accessibility Features

### Screen Reader Announcements
```
Review Card:
"Review from Sarah Admin, 2 minutes ago.
Revision request. Priority: High.
Status: Pending."

Button:
"Reply to review from Sarah Admin"
"Mark review as resolved"

Filter:
"Filter reviews by status. Current: All"
```

### Keyboard Navigation
```
Tab Order:
1. New Review button
2. Search field
3. Filter button
4. Status tabs (left to right)
5. Review cards (top to bottom)
   - Within card: Reply → Resolve → More
6. Load More trigger

Focus Indicators:
- 2px blue outline
- 4px offset
- Visible on all interactive elements
```

---

**Visual Guide Complete** ✨  
Use this guide as reference for design consistency and implementation details.

---

**Last Updated**: October 25, 2025  
**Version**: 1.0.0
