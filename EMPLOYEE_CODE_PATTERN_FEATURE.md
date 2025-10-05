# Employee Code Pattern Customization Feature

## Overview
Organizations can now customize their employee code format through the admin settings panel. This allows each organization to define their own unique pattern for generating employee/teammate codes.

## Default Pattern
The default pattern is: `{ORGCODE}-{ROLE}-{NUMBER:5}`

This generates codes like: `ORGA-EDITOR-00001`, `ORGA-ADMIN-00002`, etc.

## Pattern Syntax

### Available Placeholders
- `{ORGCODE}` - The organization's code (e.g., "ORGA", "ACME")
- `{ROLE}` - The employee's role (e.g., "EDITOR", "ADMIN", "VIDEOGRAPHER")
- `{NUMBER:N}` - Sequential number with N digits of padding (e.g., `{NUMBER:5}` → "00001")
  - Can use `{NUMBER}` for no padding
  - Can specify any digit count: `{NUMBER:3}`, `{NUMBER:6}`, etc.

### Pattern Examples
1. **Default**: `{ORGCODE}-{ROLE}-{NUMBER:5}` → `ORGA-EDITOR-00001`
2. **Compact**: `{ORGCODE}{NUMBER:4}` → `ORGA0001`
3. **With Prefix**: `EMP-{ORGCODE}-{NUMBER:6}` → `EMP-ORGA-000001`
4. **Role First**: `{ROLE}/{ORGCODE}/{NUMBER:3}` → `EDITOR/ORGA/001`
5. **Simple**: `{ORGCODE}{ROLE}{NUMBER}` → `ORGAEDITOR1`

## Backend Implementation

### Pattern Storage
- Stored in Firestore: `organizations/{orgId}/codePattern`
- Falls back to default if not set

### API Endpoints

#### Get Current Pattern
```
GET /api/team/code-pattern
Authorization: Bearer <token>

Response:
{
  "codePattern": "{ORGCODE}-{ROLE}-{NUMBER:5}"
}
```

#### Update Pattern
```
PUT /api/team/code-pattern
Authorization: Bearer <token>
Content-Type: application/json

{
  "codePattern": "{ORGCODE}{NUMBER:4}"
}

Response:
{
  "codePattern": "{ORGCODE}{NUMBER:4}",
  "message": "Code pattern updated successfully"
}
```

**Validation**: Pattern must include `{NUMBER}` placeholder (with or without digit specification).

### Code Generation
Both single and bulk code generation endpoints automatically fetch and use the organization's custom pattern:
- `POST /api/team/codes` - Single code generation
- `POST /api/team/codes/assign` - Bulk code assignment

## Frontend Implementation

### Admin Settings Page
The admin settings page (`AdminSettingsPage.jsx`) includes a "Code Pattern Editor" card with:

1. **Pattern Input**: Text field to edit the pattern template
2. **Preview**: Real-time preview showing example output
3. **Edit/Save/Cancel**: Standard edit workflow
4. **Validation**: Client-side and server-side validation

### User Flow
1. Admin navigates to Settings page
2. Clicks "Edit" on Code Pattern Editor card
3. Enters custom pattern (e.g., `{ORGCODE}{NUMBER:4}`)
4. Preview updates to show example: `ORGA0001`
5. Clicks "Save" to persist changes
6. All future code generations use the new pattern

## Technical Details

### Pattern Processing (`_format_code`)
Located in `backend/services/teammate_codes.py`:

```python
def _format_code(org_code: str, role: str, number: int, pattern: Optional[str] = None) -> str:
    if not pattern:
        pattern = "{ORGCODE}-{ROLE}-{NUMBER:5}"
    
    result = pattern.replace("{ORGCODE}", org_code)
    result = result.replace("{ROLE}", role)
    
    def replace_number(match):
        digits = match.group(1)
        if digits:
            return str(number).zfill(int(digits))
        return str(number)
    
    result = re.sub(r"\{NUMBER:?(\d*)\}", replace_number, result)
    return result
```

### Transaction Context
The `_TxnContext` dataclass includes the optional pattern field:

```python
@dataclasses.dataclass
class _TxnContext:
    org_code: str
    role: str
    expected_org_id: Optional[str]
    teammate_uid: Optional[str]
    pattern: Optional[str] = None
```

### Allocation Function
The `allocate_teammate_code` function accepts the pattern parameter:

```python
async def allocate_teammate_code(
    firestore,
    org_code: str,
    role: str,
    *,
    expected_org_id: Optional[str] = None,
    teammate_uid: Optional[str] = None,
    pattern: Optional[str] = None,
) -> AllocationResult:
    # ... implementation
```

## Testing

All 16 existing tests pass with the new pattern parameter:
- Pattern parameter is optional (defaults to standard pattern)
- Backward compatible with existing code generation
- Tests verify transaction integrity, concurrency, and idempotency

## Database Migration

Organizations that want to customize their pattern should:
1. Set `codePattern` field in their organization document
2. Use the frontend editor (recommended) or direct Firestore update
3. All new codes will use the custom pattern immediately

## Security

- Only admins can view and modify code patterns
- Pattern validation prevents malformed patterns
- Pattern changes don't affect existing employee codes
- All changes are audited through Firestore activity logs

## Future Enhancements

Potential improvements:
- Pattern validation preview in real-time
- Pattern history/versioning
- Bulk pattern migration tool
- Additional placeholders (e.g., `{DATE}`, `{LOCATION}`)
- Pattern templates gallery
