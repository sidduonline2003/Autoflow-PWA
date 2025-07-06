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

@router.put("/{client_id}")
async def update_client(client_id: str, client_data: ClientUpdateRequest, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if not current_user.get("role") == "admin": raise HTTPException(status_code=403, detail="Forbidden")
    db = firestore.client()
    client_ref = db.collection('organizations', org_id, 'clients').document(client_id)
    update_data = {f"profile.{key}": value for key, value in client_data.dict(exclude_unset=True).items()}
    update_data["profile.updatedAt"] = datetime.datetime.now(datetime.timezone.utc)
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
    client_ref.update({"profile.status": "inactive", "profile.updatedAt": datetime.datetime.now(datetime.timezone.utc)})
    return {"status": "success"}

@router.post("/bulk-update")
async def bulk_update_clients(req: BulkUpdateRequest, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if not current_user.get("role") == "admin": raise HTTPException(status_code=403, detail="Forbidden")
    if req.action == "deactivate":
        db = firestore.client()
        batch = db.batch()
        for client_id in req.clientIds:
            client_ref = db.collection('organizations', org_id, 'clients').document(client_id)
            client_doc = client_ref.get()
            if client_doc.exists:
                client_auth_uid = client_doc.to_dict().get('profile', {}).get('authUid')
                if client_auth_uid: auth.update_user(client_auth_uid, disabled=True)
                batch.update(client_ref, {"profile.status": "inactive"})
        batch.commit()
    return {"status": "success"}
