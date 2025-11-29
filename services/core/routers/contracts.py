"""
Contracts Router - Client contract management
"""

import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.auth import get_current_user, require_role
from shared.firebase_client import get_db

router = APIRouter(prefix="/contracts", tags=["Contracts"])


class ContractCreate(BaseModel):
    clientId: str
    title: str
    description: Optional[str] = None
    startDate: str
    endDate: Optional[str] = None
    value: float
    currency: str = "INR"
    terms: Optional[str] = None
    autoRenew: bool = False


class ContractUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    endDate: Optional[str] = None
    value: Optional[float] = None
    terms: Optional[str] = None
    status: Optional[str] = None
    autoRenew: Optional[bool] = None


@router.post("/")
async def create_contract(req: ContractCreate, current_user: dict = Depends(require_role(["admin"]))):
    """Create a new contract"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    contract_ref = db.collection('organizations', org_id, 'contracts').document()
    
    contract_ref.set({
        "clientId": req.clientId,
        "title": req.title,
        "description": req.description,
        "startDate": req.startDate,
        "endDate": req.endDate,
        "value": req.value,
        "currency": req.currency,
        "terms": req.terms,
        "autoRenew": req.autoRenew,
        "status": "active",
        "createdBy": current_user.get("uid"),
        "createdAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "contractId": contract_ref.id}


@router.get("/")
async def list_contracts(
    client_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List all contracts"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    query = db.collection('organizations', org_id, 'contracts')
    
    if client_id:
        query = query.where('clientId', '==', client_id)
    if status:
        query = query.where('status', '==', status)
    
    contracts = []
    for doc in query.stream():
        data = doc.to_dict()
        data['id'] = doc.id
        contracts.append(data)
    
    return contracts


@router.get("/{contract_id}")
async def get_contract(contract_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific contract"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    contract_ref = db.collection('organizations', org_id, 'contracts').document(contract_id)
    contract_doc = contract_ref.get()
    
    if not contract_doc.exists:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    data = contract_doc.to_dict()
    data['id'] = contract_id
    
    return data


@router.put("/{contract_id}")
async def update_contract(
    contract_id: str,
    req: ContractUpdate,
    current_user: dict = Depends(require_role(["admin"]))
):
    """Update a contract"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    contract_ref = db.collection('organizations', org_id, 'contracts').document(contract_id)
    contract_doc = contract_ref.get()
    
    if not contract_doc.exists:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    update_data = {k: v for k, v in req.dict().items() if v is not None}
    update_data["updatedAt"] = datetime.datetime.now(datetime.timezone.utc)
    update_data["updatedBy"] = current_user.get("uid")
    
    contract_ref.update(update_data)
    
    return {"status": "success"}


@router.delete("/{contract_id}")
async def delete_contract(contract_id: str, current_user: dict = Depends(require_role(["admin"]))):
    """Delete (archive) a contract"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    contract_ref = db.collection('organizations', org_id, 'contracts').document(contract_id)
    contract_doc = contract_ref.get()
    
    if not contract_doc.exists:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    contract_ref.update({
        "status": "archived",
        "archivedAt": datetime.datetime.now(datetime.timezone.utc),
        "archivedBy": current_user.get("uid")
    })
    
    return {"status": "success"}
