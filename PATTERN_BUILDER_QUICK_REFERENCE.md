# Employee Code Pattern Builder - Quick Reference Card

## 🎯 Quick Start
1. Go to **Settings** → **Employee Code Pattern Builder**
2. Click **Edit Pattern**
3. Build using dropdowns
4. Check preview
5. Click **Save Pattern**

---

## 📦 Component Types

| Component | What It Does | Example |
|-----------|-------------|---------|
| **Organization Code** | Your org's unique code | `ORGA`, `ACME` |
| **Role** | Employee's role | `EDITOR`, `ADMIN` |
| **Sequential Number** | Auto-incrementing | `00001`, `0042` |
| **Custom Text** | Your own text | `EMP`, `STAFF` |

---

## 🔢 Number Padding

| Setting | Output | Use Case |
|---------|--------|----------|
| 3 digits | `001` | Small teams (<1000) |
| 4 digits | `0001` | Medium teams (<10,000) |
| 5 digits | `00001` | Large teams (default) |
| 6 digits | `000001` | Very large orgs |
| None | `1` | Simple counting |

---

## 🔗 Separator Options

| Separator | Symbol | Example |
|-----------|--------|---------|
| None | _(nothing)_ | `ORGA00001` |
| Dash | `-` | `ORGA-EDITOR-00001` |
| Slash | `/` | `ORGA/EDITOR/00001` |
| Underscore | `_` | `ORGA_EDITOR_00001` |
| Dot | `.` | `ORGA.EDITOR.00001` |
| Space | ` ` | `ORGA EDITOR 00001` |

---

## 💡 Common Patterns

### Minimal
**Pattern**: Org Code + Number (4 digits)  
**Output**: `ORGA0001`  
**Best for**: Small teams, simple tracking

### Standard (Default)
**Pattern**: Org Code - Role - Number (5 digits)  
**Output**: `ORGA-EDITOR-00001`  
**Best for**: Most organizations

### With Prefix
**Pattern**: "EMP" - Org Code - Number (6 digits)  
**Output**: `EMP-ORGA-000001`  
**Best for**: HR systems, payroll integration

### Role-First
**Pattern**: Role / Org Code / Number (3 digits)  
**Output**: `EDITOR/ORGA/001`  
**Best for**: Role-based access systems

---

## ✅ Do's

✅ Keep it simple and readable  
✅ Use padding for better sorting  
✅ Test the preview before saving  
✅ Include org code for uniqueness  
✅ Document your pattern choice

---

## ❌ Don'ts

❌ Don't make patterns too long  
❌ Don't use special characters  
❌ Don't change patterns frequently  
❌ Don't forget the number component  
❌ Don't expect old codes to update

---

## 🔧 Button Guide

| Button | Action |
|--------|--------|
| **Edit Pattern** | Start editing mode |
| **Add Component** | Add new piece to pattern |
| **🗑️ (Trash)** | Remove component |
| **Save Pattern** | Save changes |
| **Cancel** | Discard changes |

---

## 🎨 Reading the Preview

### Component Preview
Shows what each piece will look like:
```
Preview: ORGA-
```

### Full Pattern Preview
Shows the complete code:
```
Full Pattern Preview:
ORGA-EDITOR-00001
```

---

## ⚠️ Important Notes

1. **Number Required**: You must include a Sequential Number component
2. **No Retroactive Changes**: Old codes don't change when you update the pattern
3. **Minimum Components**: You need at least 1 component
4. **Preview is Sample**: Uses `ORGA` and `EDITOR` as examples

---

## 🆘 Troubleshooting

### "Pattern must include {NUMBER} placeholder"
→ Add a Sequential Number component

### Can't delete a component
→ You must have at least 1 component

### Preview shows wrong org code
→ That's OK! It's just sample data

### Existing codes didn't change
→ Pattern only affects NEW codes

---

## 📞 Need Help?

- Read: **PATTERN_BUILDER_UI_GUIDE.md**
- Contact: System Administrator
- Support: Create GitHub issue

---

## 🎓 Examples with Steps

### Example 1: Make `ORGA0001`
1. Edit pattern
2. Component 1: Org Code, Separator: None
3. Component 2: Number (4 digits), Separator: None
4. Remove other components
5. Check preview shows `ORGA0001`
6. Save

### Example 2: Make `EMP-ORGA-00042`
1. Edit pattern
2. Component 1: Custom Text ("EMP"), Separator: Dash
3. Component 2: Org Code, Separator: Dash
4. Component 3: Number (5 digits), Separator: None
5. Check preview shows `EMP-ORGA-00001`
6. Save

---

**Print this card and keep it handy!** 📌

Last Updated: October 6, 2025
