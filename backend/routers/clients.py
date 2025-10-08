from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import auth, firestore
from pydantic import BaseModel
from typing import List
import datetime
import secrets
import string

from ..dependencies import get_current_user

router = APIRouter(
    prefix="/clients",
    tags=["Client Management"],
)

class ClientCreationRequest(BaseModel): name: str; email: str; phone: str | None; address: str | None; businessType: str | None
class ClientUpdateRequest(BaseModel): name: str; phone: str | None; address: str | None; businessType: str | None; status: str
class BulkUpdateRequest(BaseModel): clientIds: List[str]; action: str

@router.post("/")
async def create_client(client_data: ClientCreationRequest, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if not current_user.get("role") == "admin" or not org_id: raise HTTPException(status_code=403, detail="Forbidden")
    try:
        db = firestore.client()
        temp_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for i in range(10))
        new_user = auth.create_user(email=client_data.email, password=temp_password, display_name=client_data.name)
        client_ref = db.collection('organizations', org_id, 'clients').document()
        new_client_id = client_ref.id
        client_ref.set({"profile": {"name": client_data.name, "email": client_data.email, "phone": client_data.phone, "address": client_data.address, "businessType": client_data.businessType, "authUid": new_user.uid, "loginCredentials": {"username": client_data.email, "tempPassword": temp_password}, "createdAt": datetime.datetime.now(datetime.timezone.utc), "updatedAt": datetime.datetime.now(datetime.timezone.utc), "status": "active"}})
        auth.set_custom_user_claims(new_user.uid, {'role': 'client', 'orgId': org_id, 'clientId': new_client_id})
        return {"status": "success", "clientId": new_client_id, "tempPassword": temp_password}
    except auth.EmailAlreadyExistsError: raise HTTPException(status_code=400, detail="Email already exists")
    except Exception as e: raise HTTPException(status_code=500, detail=f"Internal server error: {e}")

@router.get("/")
async def get_clients(current_user: dict = Depends(get_current_user)):
    """Get all clients for the organization"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role")
    if user_role not in ["admin", "accountant"] or not org_id: 
        raise HTTPException(status_code=403, detail="Forbidden")
    
    try:
        db = firestore.client()
        clients_ref = db.collection('organizations', org_id, 'clients')
        clients = []
        
        for doc in clients_ref.stream():
            client_data = doc.to_dict()
            client_info = {
                "id": doc.id,
                **client_data.get("profile", {}),
            }
            clients.append(client_info)
        
        return clients
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get clients: {str(e)}")

@router.put("/{client_id}")
async def update_client(client_id: str, client_data: ClientUpdateRequest, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if not current_user.get("role") == "admin": raise HTTPException(status_code=403, detail="Forbidden")
    db = firestore.client()
    client_ref = db.collection('organizations', org_id, 'clients').document(client_id)
    client_doc = client_ref.get()
    if not client_doc.exists: raise HTTPException(status_code=404, detail="Client not found")

    profile = client_doc.to_dict().get('profile', {})
    client_auth_uid = profile.get('authUid')
    current_status = profile.get('status')
    new_status = client_data.status
    timestamp = datetime.datetime.now(datetime.timezone.utc)

    if new_status and new_status != current_status and client_auth_uid:
        auth.update_user(client_auth_uid, disabled=(new_status != "active"))

    update_data = {f"profile.{key}": value for key, value in client_data.dict(exclude_unset=True).items()}
    update_data["profile.updatedAt"] = timestamp

    if new_status == "inactive":
        update_data["profile.deactivatedAt"] = timestamp
    elif new_status == "active":
        update_data["profile.reactivatedAt"] = timestamp
        update_data["profile.deactivatedAt"] = None

    client_ref.update(update_data)
    return {"status": "success"}

@router.delete("/{client_id}")
async def delete_client(client_id: str, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if not current_user.get("role") == "admin": raise HTTPException(status_code=403, detail="Forbidden")
    db = firestore.client()
    client_ref = db.collection('organizations', org_id, 'clients').document(client_id)
    client_doc = client_ref.get()
    if not client_doc.exists: raise HTTPException(status_code=404, detail="Client not found")
    client_auth_uid = client_doc.to_dict().get('profile', {}).get('authUid')
    if client_auth_uid: auth.update_user(client_auth_uid, disabled=True)
    timestamp = datetime.datetime.now(datetime.timezone.utc)
    client_ref.update({"profile.status": "inactive", "profile.updatedAt": timestamp, "profile.deactivatedAt": timestamp})
    return {"status": "success"}

@router.post("/{client_id}/activate")
async def activate_client(client_id: str, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if not current_user.get("role") == "admin": raise HTTPException(status_code=403, detail="Forbidden")
    db = firestore.client()
    client_ref = db.collection('organizations', org_id, 'clients').document(client_id)
    client_doc = client_ref.get()
    if not client_doc.exists: raise HTTPException(status_code=404, detail="Client not found")

    profile = client_doc.to_dict().get('profile', {})
    client_auth_uid = profile.get('authUid')
    timestamp = datetime.datetime.now(datetime.timezone.utc)

    if client_auth_uid: auth.update_user(client_auth_uid, disabled=False)

    client_ref.update({
        "profile.status": "active",
        "profile.updatedAt": timestamp,
        "profile.reactivatedAt": timestamp,
        "profile.deactivatedAt": None,
    })

    return {"status": "success"}

@router.post("/bulk-update")
async def bulk_update_clients(req: BulkUpdateRequest, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if not current_user.get("role") == "admin": raise HTTPException(status_code=403, detail="Forbidden")
    if req.action not in {"deactivate", "activate"}: raise HTTPException(status_code=400, detail="Unsupported action")

    db = firestore.client()
    batch = db.batch()
    for client_id in req.clientIds:
        client_ref = db.collection('organizations', org_id, 'clients').document(client_id)
        client_doc = client_ref.get()
        if not client_doc.exists: continue

        profile = client_doc.to_dict().get('profile', {})
        client_auth_uid = profile.get('authUid')
        timestamp = datetime.datetime.now(datetime.timezone.utc)

        if req.action == "deactivate":
            if client_auth_uid: auth.update_user(client_auth_uid, disabled=True)
            batch.update(client_ref, {
                "profile.status": "inactive",
                "profile.updatedAt": timestamp,
                "profile.deactivatedAt": timestamp,
            })
        else:
            if client_auth_uid: auth.update_user(client_auth_uid, disabled=False)
            batch.update(client_ref, {
                "profile.status": "active",
                "profile.updatedAt": timestamp,
                "profile.reactivatedAt": timestamp,
                "profile.deactivatedAt": None,
            })

    batch.commit()
    return {"status": "success"}
