from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone
from uuid import uuid4
import logging

from ..dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/financial-hub/sequences",
    tags=["Number Sequences"],
)

# --- Pydantic Models ---
class SequenceAllocation(BaseModel):
    type: str = Field(..., pattern="^(INVOICE|CREDIT_NOTE|BILL|PAYSLIP)$")
    year: int = Field(..., ge=2000, le=2100)
    idempotencyKey: str = Field(default_factory=lambda: uuid4().hex)

class SequenceInfo(BaseModel):
    type: str
    year: int
    prefix: str
    next: int
    lastUpdated: datetime

# --- Helper Functions ---
def get_utc_now():
    """Get current time in UTC"""
    return datetime.now(timezone.utc)

def is_authorized_for_sequences(current_user: dict) -> bool:
    """Check if user can view sequences (ADMIN or ACCOUNTANT only)"""
    role = current_user.get("role", "").lower()
    return role in ["admin", "accountant"]

def get_sequence_prefix(doc_type: str, year: int) -> str:
    """Get prefix for sequence based on type and year"""
    prefixes = {
        "INVOICE": f"INV-{year}-",
        "CREDIT_NOTE": f"CN-{year}-",
        "BILL": f"BILL-{year}-",
        "PAYSLIP": f"PAY-{year}-"
    }
    return prefixes.get(doc_type, f"{doc_type}-{year}-")

def format_document_number(doc_type: str, year: int, sequence: int) -> str:
    """Format complete document number"""
    prefix = get_sequence_prefix(doc_type, year)
    return f"{prefix}{sequence:04d}"

def audit_log(db, org_id: str, entity: str, action: str, actor: str, payload_summary: str = ""):
    """Log audit events"""
    try:
        audit_ref = db.collection('organizations', org_id, 'auditLogs').document()
        audit_ref.set({
            "entity": entity,
            "action": action,
            "actor": actor,
            "timestamp": get_utc_now(),
            "payloadSummary": payload_summary
        })
    except Exception as e:
        logger.warning(f"Failed to write audit log: {e}")

def allocate_sequence_number(db, org_id: str, doc_type: str, year: int, idempotency_key: str) -> dict:
    """
    Allocate next sequence number atomically with idempotency support.
    Returns: {"number": "INV-2025-0001", "sequence": 1, "isNew": True}
    """
    sequence_id = f"{doc_type}_{year}"
    sequence_ref = db.collection('organizations', org_id, 'numberSequences').document(sequence_id)
    
    # Check for existing allocation with same idempotency key
    allocations_query = db.collection('organizations', org_id, 'sequenceAllocations').where(
        'idempotencyKey', '==', idempotency_key
    ).where(
        'type', '==', doc_type
    ).where(
        'year', '==', year
    ).limit(1).get()
    
    if allocations_query:
        # Return existing allocation
        existing = allocations_query[0].to_dict()
        return {
            "number": existing.get('number'),
            "sequence": existing.get('sequence'),
            "isNew": False
        }
    
    # Atomic transaction to allocate new number
    @firestore.transactional
    def allocate_in_transaction(transaction):
        sequence_doc = sequence_ref.get(transaction=transaction)
        
        if sequence_doc.exists:
            sequence_data = sequence_doc.to_dict()
            next_num = sequence_data.get('next', 1)
        else:
            next_num = 1
            # Initialize sequence document
            sequence_init = {
                "orgId": org_id,
                "type": doc_type,
                "year": year,
                "prefix": get_sequence_prefix(doc_type, year),
                "next": 1,
                "createdAt": get_utc_now(),
                "updatedAt": get_utc_now()
            }
            transaction.set(sequence_ref, sequence_init)
        
        # Increment next number
        transaction.update(sequence_ref, {
            "next": next_num + 1,
            "updatedAt": get_utc_now()
        })
        
        # Record allocation for idempotency
        allocation_ref = db.collection('organizations', org_id, 'sequenceAllocations').document()
        allocation_data = {
            "orgId": org_id,
            "type": doc_type,
            "year": year,
            "sequence": next_num,
            "number": format_document_number(doc_type, year, next_num),
            "idempotencyKey": idempotency_key,
            "allocatedAt": get_utc_now()
        }
        transaction.set(allocation_ref, allocation_data)
        
        return {
            "number": format_document_number(doc_type, year, next_num),
            "sequence": next_num,
            "isNew": True
        }
    
    # Execute transaction
    transaction = db.transaction()
    return allocate_in_transaction(transaction)

# --- API Endpoints ---
@router.get("/")
async def list_sequences(
    current_user: dict = Depends(get_current_user)
):
    """List all number sequences for the organization"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_sequences(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to view sequences")
    
    db = firestore.client()
    
    sequences_query = db.collection('organizations', org_id, 'numberSequences').get()
    
    sequences = []
    for doc in sequences_query:
        sequence_data = doc.to_dict()
        sequence_data['id'] = doc.id
        sequences.append(sequence_data)
    
    # Sort by type, year
    sequences.sort(key=lambda x: (x.get('type', ''), x.get('year', 0)), reverse=True)
    
    return sequences

@router.get("/{doc_type}/{year}")
async def get_sequence(
    doc_type: str,
    year: int,
    current_user: dict = Depends(get_current_user)
):
    """Get specific sequence information"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_sequences(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to view sequences")
    
    # Validate doc_type
    valid_types = ["INVOICE", "CREDIT_NOTE", "BILL", "PAYSLIP"]
    if doc_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid document type. Must be one of: {valid_types}")
    
    db = firestore.client()
    
    sequence_id = f"{doc_type}_{year}"
    sequence_ref = db.collection('organizations', org_id, 'numberSequences').document(sequence_id)
    sequence_doc = sequence_ref.get()
    
    if not sequence_doc.exists:
        # Return default/initial state
        return {
            "type": doc_type,
            "year": year,
            "prefix": get_sequence_prefix(doc_type, year),
            "next": 1,
            "lastUpdated": None,
            "exists": False
        }
    
    sequence_data = sequence_doc.to_dict()
    sequence_data['exists'] = True
    
    return sequence_data

@router.post("/allocate")
async def allocate_number(
    req: SequenceAllocation,
    current_user: dict = Depends(get_current_user)
):
    """Allocate next number in sequence (for system use)"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_sequences(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for sequence allocation")
    
    db = firestore.client()
    
    try:
        result = allocate_sequence_number(db, org_id, req.type, req.year, req.idempotencyKey)
        
        # Audit log only for new allocations
        if result["isNew"]:
            audit_log(
                db, org_id, "SEQUENCE", "SEQUENCE_ALLOCATED", 
                current_user.get("uid"), 
                f"Allocated {req.type} {result['number']}"
            )
        
        return {
            "status": "success",
            "number": result["number"],
            "sequence": result["sequence"],
            "isNew": result["isNew"]
        }
        
    except Exception as e:
        logger.error(f"Error allocating sequence number: {e}")
        raise HTTPException(status_code=500, detail="Failed to allocate sequence number")

@router.get("/allocations")
async def list_allocations(
    doc_type: Optional[str] = None,
    year: Optional[int] = None,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """List recent sequence allocations"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_sequences(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to view allocations")
    
    db = firestore.client()
    
    query = db.collection('organizations', org_id, 'sequenceAllocations')
    
    if doc_type:
        query = query.where('type', '==', doc_type)
    if year:
        query = query.where('year', '==', year)
    
    allocations = []
    for doc in query.order_by('allocatedAt', direction=firestore.Query.DESCENDING).limit(limit).get():
        allocation_data = doc.to_dict()
        allocation_data['id'] = doc.id
        allocations.append(allocation_data)
    
    return allocations

@router.get("/validate/{doc_type}/{year}")
async def validate_sequence_integrity(
    doc_type: str,
    year: int,
    current_user: dict = Depends(get_current_user)
):
    """Validate sequence integrity and detect gaps"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_sequences(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for validation")
    
    # Validate doc_type
    valid_types = ["INVOICE", "CREDIT_NOTE", "BILL", "PAYSLIP"]
    if doc_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid document type. Must be one of: {valid_types}")
    
    db = firestore.client()
    
    # Get all allocations for this type/year
    allocations_query = db.collection('organizations', org_id, 'sequenceAllocations').where(
        'type', '==', doc_type
    ).where(
        'year', '==', year
    ).order_by('sequence').get()
    
    allocated_numbers = [doc.to_dict().get('sequence') for doc in allocations_query]
    
    if not allocated_numbers:
        return {
            "type": doc_type,
            "year": year,
            "hasGaps": False,
            "gaps": [],
            "duplicates": [],
            "highestAllocated": 0,
            "totalAllocated": 0
        }
    
    # Detect gaps
    gaps = []
    expected = 1
    for num in sorted(allocated_numbers):
        if num > expected:
            gaps.extend(range(expected, num))
        expected = max(expected, num + 1)
    
    # Detect duplicates
    seen = set()
    duplicates = []
    for num in allocated_numbers:
        if num in seen:
            duplicates.append(num)
        seen.add(num)
    
    return {
        "type": doc_type,
        "year": year,
        "hasGaps": len(gaps) > 0,
        "gaps": gaps,
        "duplicates": duplicates,
        "highestAllocated": max(allocated_numbers) if allocated_numbers else 0,
        "totalAllocated": len(allocated_numbers)
    }
