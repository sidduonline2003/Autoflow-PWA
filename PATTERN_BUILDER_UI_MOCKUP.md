# Pattern Builder UI - Visual Layout Guide

## Overview Screen (Not Editing)

```
┌─────────────────────────────────────────────────────────────┐
│ 📝 Employee Code Pattern Builder              [Edit Pattern] │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ Current Pattern:                                      │   │
│ │ {ORGCODE}-{ROLE}-{NUMBER:5}                          │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                               │
│ Example Output:                                               │
│ ORGA-EDITOR-00001                                            │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Editing Screen (Pattern Builder Active)

```
┌──────────────────────────────────────────────────────────────────┐
│ 📝 Employee Code Pattern Builder                                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ℹ️ Build your custom employee code pattern by adding            │
│    components and choosing separators between them.             │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ Component 1                                                 │ │
│ │                                                             │ │
│ │ [Component Type ▼]  [Separator ▼]  [🗑️]                    │ │
│ │  Organization Code    Dash (-)                              │ │
│ │                                                             │ │
│ │ Preview: ORGA-                                              │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ Component 2                                                 │ │
│ │                                                             │ │
│ │ [Component Type ▼]  [Separator ▼]  [🗑️]                    │ │
│ │        Role           Dash (-)                              │ │
│ │                                                             │ │
│ │ Preview: EDITOR-                                            │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ Component 3                                                 │ │
│ │                                                             │ │
│ │ [Component Type ▼]  [Digits ▼]  [Separator ▼]  [🗑️]        │ │
│ │ Sequential Number   5 (00001)      None                     │ │
│ │                                                             │ │
│ │ Preview: 00001                                              │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [+ Add Component]                                               │
│                                                                  │
│ ─────────────────────────────────────────────────────────────   │
│                                                                  │
│ Full Pattern Preview:                                            │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ ORGA-EDITOR-00001                                          │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [💾 Save Pattern]  [❌ Cancel]                                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Detailed Component Dropdowns

### Component Type Dropdown (All Components)
```
┌─────────────────────────┐
│ Component Type      [▼] │
├─────────────────────────┤
│ Organization Code       │  ← Auto-filled (e.g., ORGA, ACME)
│ Role                    │  ← Auto-filled (e.g., EDITOR, ADMIN)
│ Sequential Number       │  ← Auto-increment with padding
│ Custom Text             │  ← User enters text
└─────────────────────────┘
```

### Digits Dropdown (Only for Sequential Number)
```
┌─────────────────────────┐
│ Digits              [▼] │
├─────────────────────────┤
│ 3 (001)                 │
│ 4 (0001)                │
│ 5 (00001)               │  ← Default
│ 6 (000001)              │
│ None (1)                │
└─────────────────────────┘
```

### Custom Text Input (Only for Custom Text)
```
┌─────────────────────────┐
│ Custom Text             │
│ [EMP_____________]      │  ← User types here
└─────────────────────────┘
```

### Separator Dropdown (All Components)
```
┌─────────────────────────┐
│ Separator           [▼] │
├─────────────────────────┤
│ None                    │
│ Dash (-)                │  ← Default
│ Slash (/)               │
│ Underscore (_)          │
│ Dot (.)                 │
│ Space ( )               │
└─────────────────────────┘
```

---

## Example Configurations

### Example 1: Compact Format (ORGA0001)
```
┌────────────────────────────────────────────────────┐
│ Component 1                                        │
│ [Organization Code ▼]  [None ▼]  [🗑️]             │
│ Preview: ORGA                                      │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ Component 2                                        │
│ [Sequential Number ▼]  [4 (0001) ▼]  [None ▼]  [🗑️]│
│ Preview: 0001                                      │
└────────────────────────────────────────────────────┘

Full Pattern Preview: ORGA0001
```

---

### Example 2: Custom Prefix (EMP-ORGA-000001)
```
┌────────────────────────────────────────────────────┐
│ Component 1                                        │
│ [Custom Text ▼]  [EMP]  [Dash (-) ▼]  [🗑️]        │
│ Preview: EMP-                                      │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ Component 2                                        │
│ [Organization Code ▼]  [Dash (-) ▼]  [🗑️]         │
│ Preview: ORGA-                                     │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ Component 3                                        │
│ [Sequential Number ▼]  [6 (000001) ▼]  [None ▼]  [🗑️]│
│ Preview: 000001                                    │
└────────────────────────────────────────────────────┘

Full Pattern Preview: EMP-ORGA-000001
```

---

### Example 3: Role-First (EDITOR/ORGA/001)
```
┌────────────────────────────────────────────────────┐
│ Component 1                                        │
│ [Role ▼]  [Slash (/) ▼]  [🗑️]                     │
│ Preview: EDITOR/                                   │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ Component 2                                        │
│ [Organization Code ▼]  [Slash (/) ▼]  [🗑️]        │
│ Preview: ORGA/                                     │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ Component 3                                        │
│ [Sequential Number ▼]  [3 (001) ▼]  [None ▼]  [🗑️]│
│ Preview: 001                                       │
└────────────────────────────────────────────────────┘

Full Pattern Preview: EDITOR/ORGA/001
```

---

## Interactive States

### Adding a New Component
```
[+ Add Component]  ← Click this button

⬇️

New component card appears at bottom:

┌────────────────────────────────────────────────────┐
│ Component 4                                        │
│ [Component Type ▼]  [Separator ▼]  [🗑️]           │
│    Custom Text        None                         │
│                                                    │
│ [Custom Text: ___________]                         │
│                                                    │
│ Preview: ___                                       │
└────────────────────────────────────────────────────┘
```

### Removing a Component
```
Click [🗑️] button → Component card disappears
(Must keep at least 1 component)
```

### Changing Component Type
```
Before:
┌────────────────────────────────────────────────────┐
│ [Role ▼]  [Dash (-) ▼]  [🗑️]                      │
└────────────────────────────────────────────────────┘

Change dropdown to "Sequential Number" ⬇️

After:
┌────────────────────────────────────────────────────┐
│ [Sequential Number ▼]  [5 (00001) ▼]  [Dash (-) ▼]  [🗑️]│
└────────────────────────────────────────────────────┘
```

---

## Mobile Responsive Layout

On mobile screens, components stack vertically:

```
┌────────────────────────────┐
│ Component 1                │
│ [Component Type ▼]         │
│  Organization Code         │
│                            │
│ [Separator ▼]              │
│    Dash (-)                │
│                            │
│ [🗑️]                       │
│                            │
│ Preview: ORGA-             │
└────────────────────────────┘

┌────────────────────────────┐
│ Component 2                │
│ [Component Type ▼]         │
│      Role                  │
│                            │
│ [Separator ▼]              │
│    Dash (-)                │
│                            │
│ [🗑️]                       │
│                            │
│ Preview: EDITOR-           │
└────────────────────────────┘

... and so on
```

---

## Color Scheme

### Component Cards
- **Background**: Light gray (`grey.50`)
- **Border**: None (uses Paper elevation)
- **Padding**: 16px

### Dropdowns
- **Label**: Material UI default (dark gray)
- **Selected value**: Black
- **Border**: Material UI outlined style

### Previews
- **Label text**: Gray (`text.secondary`)
- **Preview value**: Blue (`primary.main`)
- **Font**: Monospace

### Buttons
- **Save**: Blue contained button with save icon
- **Cancel**: Gray outlined button with cancel icon
- **Add Component**: Blue outlined button with add icon
- **Remove**: Red icon button with trash icon

### Full Preview Box
- **Background**: Light blue (`primary.50`)
- **Text**: Blue (`primary.main`)
- **Font**: Monospace, larger size

---

## Accessibility Features

### Keyboard Navigation
- Tab through all controls in order
- Enter to open dropdowns
- Arrow keys to select dropdown items
- Space to toggle checkboxes (if added)
- Enter on buttons to activate

### Screen Reader Support
- All inputs have labels
- Icon buttons have aria-labels
- Form structure is semantic HTML
- Status messages announced on save/error

### Visual Indicators
- Focus rings on active elements
- Disabled state styling (grayed out)
- Hover states on interactive elements
- Clear button labels with icons

---

## Animation & Transitions

### On Component Add
```
Opacity: 0 → 1 (fade in)
Transform: scale(0.95) → scale(1)
Duration: 200ms
```

### On Component Remove
```
Opacity: 1 → 0 (fade out)
Height: full → 0 (collapse)
Duration: 150ms
```

### On Dropdown Open
```
Material UI default dropdown animation
```

### On Save Success
```
Success message: slide in from right
Auto-dismiss after 3 seconds
```

---

This visual guide helps developers and designers understand the exact layout and interaction patterns of the Pattern Builder UI.
