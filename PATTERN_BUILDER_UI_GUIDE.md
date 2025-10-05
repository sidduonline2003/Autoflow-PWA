# Employee Code Pattern Builder - User Guide

## Overview
The **Pattern Builder** is a drag-and-drop style interface that allows administrators to create custom employee code formats without typing complex template syntax. Instead of manually entering `{ORGCODE}-{ROLE}-{NUMBER:5}`, admins can build patterns using intuitive dropdown menus.

## Accessing the Pattern Builder

1. Log in as an **Admin** user
2. Navigate to **Settings** page
3. Locate the **"Employee Code Pattern Builder"** card
4. Click **"Edit Pattern"** button

## Building a Custom Pattern

### Step 1: Understanding Components

Each pattern is made up of **components** that you can add, configure, and arrange:

#### Available Component Types

| Component Type | Description | Example Output |
|---------------|-------------|----------------|
| **Organization Code** | Your organization's unique code | `ORGA`, `ACME`, `STUDIO1` |
| **Role** | Employee's role (normalized) | `EDITOR`, `ADMIN`, `PRODUCER` |
| **Sequential Number** | Auto-incrementing number with padding | `00001`, `0042`, `123` |
| **Custom Text** | Any text you want to include | `EMP`, `STAFF`, `ID` |

### Step 2: Configuring Components

#### For "Sequential Number" Component:
Choose the **digit padding** from dropdown:
- **3 digits** → `001`, `002`, ..., `999`
- **4 digits** → `0001`, `0002`, ..., `9999`
- **5 digits** → `00001`, `00042`, ..., `99999`
- **6 digits** → `000001`, `000123`, ..., `999999`
- **None** → `1`, `2`, ..., `1000` (no padding)

#### For "Custom Text" Component:
Enter any text you want in the **Custom Text** field:
- Examples: `EMP`, `STAFF`, `ID-`, `MEMBER`

#### For "Organization Code" and "Role":
These pull data automatically - no configuration needed!

### Step 3: Adding Separators

After each component, you can choose a **separator** from the dropdown:

| Separator | Display | Example |
|-----------|---------|---------|
| **None** | _(nothing)_ | `ORGA00001` |
| **Dash** | `-` | `ORGA-EDITOR-00001` |
| **Slash** | `/` | `ORGA/EDITOR/00001` |
| **Underscore** | `_` | `ORGA_EDITOR_00001` |
| **Dot** | `.` | `ORGA.EDITOR.00001` |
| **Space** | ` ` | `ORGA EDITOR 00001` |

### Step 4: Managing Components

- **Add Component**: Click the **"+ Add Component"** button
- **Remove Component**: Click the red **trash icon** (🗑️) next to each component
  - Note: You must have at least one component (cannot delete if only 1 exists)
- **Reorder**: Components appear in the order they're listed (top to bottom)

## Example Patterns

### Example 1: Default Pattern
**Goal**: `ORGA-EDITOR-00001`

**Components**:
1. Component Type: **Organization Code** → Separator: **Dash (-)**
2. Component Type: **Role** → Separator: **Dash (-)**
3. Component Type: **Sequential Number** (5 digits) → Separator: **None**

---

### Example 2: Compact Pattern
**Goal**: `ORGA0001`

**Components**:
1. Component Type: **Organization Code** → Separator: **None**
2. Component Type: **Sequential Number** (4 digits) → Separator: **None**

---

### Example 3: With Custom Prefix
**Goal**: `EMP-ORGA-000001`

**Components**:
1. Component Type: **Custom Text** → Text: `EMP` → Separator: **Dash (-)**
2. Component Type: **Organization Code** → Separator: **Dash (-)**
3. Component Type: **Sequential Number** (6 digits) → Separator: **None**

---

### Example 4: Role-First Pattern
**Goal**: `EDITOR/ORGA/001`

**Components**:
1. Component Type: **Role** → Separator: **Slash (/)**
2. Component Type: **Organization Code** → Separator: **Slash (/)**
3. Component Type: **Sequential Number** (3 digits) → Separator: **None**

---

### Example 5: Simple Numbers Only
**Goal**: `ORGA001`

**Components**:
1. Component Type: **Organization Code** → Separator: **None**
2. Component Type: **Sequential Number** (3 digits) → Separator: **None**

---

### Example 6: Multiple Custom Text
**Goal**: `STAFF-ID-ORGA-00042`

**Components**:
1. Component Type: **Custom Text** → Text: `STAFF` → Separator: **Dash (-)**
2. Component Type: **Custom Text** → Text: `ID` → Separator: **Dash (-)**
3. Component Type: **Organization Code** → Separator: **Dash (-)**
4. Component Type: **Sequential Number** (5 digits) → Separator: **None**

## Real-Time Preview

As you build your pattern, the interface shows **two levels of preview**:

### 1. Component Preview
Each component card shows a mini-preview:
```
Preview: ORGA-
```

### 2. Full Pattern Preview
At the bottom, see the complete pattern output:
```
Full Pattern Preview:
ORGA-EDITOR-00001
```

This preview uses sample data:
- Organization Code: `ORGA`
- Role: `EDITOR`
- Number: `1` (padded based on your digit setting)

## Saving Your Pattern

1. Build your pattern using the dropdowns and text fields
2. Check the **Full Pattern Preview** to verify it looks correct
3. Click **"Save Pattern"** button
4. Success message will appear: "Pattern updated successfully!"
5. All future employee code generations will use your new pattern

## Validation Rules

The pattern builder enforces these rules:

- ✅ **At least one component** must exist
- ✅ **Must include a Sequential Number** component (the backend validates this)
- ✅ Components are processed **left to right** in the order shown

If validation fails, you'll see an error message explaining what needs to be fixed.

## Canceling Changes

- Click **"Cancel"** button to discard changes
- Your previous pattern will remain active
- All unsaved component configurations will be lost

## Technical Details

### What Happens Behind the Scenes?

When you save a pattern, the UI converts your component selections into a **template string**:

| Your Selection | Generated Template |
|---------------|-------------------|
| Organization Code | `{ORGCODE}` |
| Role | `{ROLE}` |
| Sequential Number (5 digits) | `{NUMBER:5}` |
| Sequential Number (no padding) | `{NUMBER}` |
| Custom Text: "EMP" | `EMP` |

**Example Conversion**:
- **UI Components**: OrgCode → Dash → Role → Dash → Number(5)
- **Generated Template**: `{ORGCODE}-{ROLE}-{NUMBER:5}`
- **Actual Output**: `ORGA-EDITOR-00001`

### Backend Integration

The pattern is stored in Firestore:
```
organizations/{orgId}/codePattern
```

When a new employee code is generated:
1. Fetch the organization's `codePattern`
2. Replace placeholders with actual values
3. Increment the sequential number
4. Save to the employee's profile

## Common Use Cases

### Use Case 1: Simple Numbering
**Scenario**: Small team, just want sequential numbers
**Pattern**: `{ORGCODE}{NUMBER:4}`
**Output**: `ACME0001`, `ACME0002`, `ACME0003`

### Use Case 2: Role-Based Tracking
**Scenario**: Track employees by role
**Pattern**: `{ORGCODE}-{ROLE}-{NUMBER:5}`
**Output**: `ACME-EDITOR-00001`, `ACME-ADMIN-00001`

### Use Case 3: Department Codes
**Scenario**: Add department prefix
**Pattern**: `DEPT-{ORGCODE}-{NUMBER:6}`
**Output**: `DEPT-ACME-000001`

### Use Case 4: Year-Based (with Custom Text)
**Scenario**: Include year prefix
**Pattern**: `2025-{ORGCODE}-{NUMBER:4}`
**Output**: `2025-ACME-0001`

## Tips & Best Practices

### ✅ Do's
- **Keep it simple**: Shorter patterns are easier to read and remember
- **Use padding**: Helps with sorting (e.g., `00001` sorts before `00010`)
- **Test preview**: Always check the preview before saving
- **Include org code**: Makes codes unique across organizations
- **Document your pattern**: Keep a record of your pattern logic

### ❌ Don'ts
- **Don't make it too long**: Patterns like `ABC-XYZ-123-ROLE-ORG-00001` are hard to use
- **Don't use special characters**: Stick to alphanumerics and basic separators
- **Don't change frequently**: Existing codes won't update automatically
- **Don't remove the number component**: The system requires a sequential number

## Troubleshooting

### Problem: "Pattern must include {NUMBER} placeholder"
**Solution**: Add a **Sequential Number** component to your pattern

### Problem: Can't delete a component
**Solution**: You must have at least one component in the pattern

### Problem: Preview shows wrong organization code
**Solution**: The preview uses sample data. Actual codes will use your real org code.

### Problem: Existing employee codes didn't change
**Solution**: Pattern changes only affect **new** code generations, not existing ones

## Support

For additional help or feature requests, contact your system administrator or development team.

---

**Last Updated**: October 6, 2025  
**Version**: 2.0 (Pattern Builder UI)
