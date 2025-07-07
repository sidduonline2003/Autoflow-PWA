from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel
from typing import Optional
import datetime

from ..dependencies import get_current_user

router = APIRouter(
    prefix="/contracts",
    tags=["Contract Management"],
)

# --- Pydantic Models ---
class ContractRequest(BaseModel):
    title: str
    terms: str
    amount: str
    dueDate: str
    status: Optional[str] = "draft"

# --- Contract Management Endpoints ---
@router.post("/for-client/{client_id}")
async def create_contract(
    client_id: str,
    req: ContractRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create a contract for a client"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    contract_ref = db.collection('organizations', org_id, 'clients', client_id, 'contracts').document()
    
    contract_ref.set({
        "title": req.title,
        "terms": req.terms,
        "amount": req.amount,
        "dueDate": req.dueDate,
        "status": req.status,
        "createdAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "contractId": contract_ref.id}

@router.get("/for-client/{client_id}")
async def get_client_contracts(
    client_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all contracts for a client"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    contracts_ref = db.collection('organizations', org_id, 'clients', client_id, 'contracts')
    contracts = contracts_ref.stream()
    
    return {
        "contracts": [{"id": contract.id, **contract.to_dict()} for contract in contracts]
    }

@router.put("/{contract_id}/status")
async def update_contract_status(
    contract_id: str,
    client_id: str,
    status: str,
    current_user: dict = Depends(get_current_user)
):
    """Update contract status (draft, sent, signed, expired)"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    contract_ref = db.collection('organizations', org_id, 'clients', client_id, 'contracts').document(contract_id)
    
    contract_doc = contract_ref.get()
    if not contract_doc.exists:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    update_data = {
        "status": status,
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    }
    
    if status == "signed":
        update_data["signedAt"] = datetime.datetime.now(datetime.timezone.utc)
    
    contract_ref.update(update_data)
    
    return {"status": "success", "message": f"Contract status updated to {status}"}
