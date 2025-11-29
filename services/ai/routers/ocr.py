"""
OCR router - Optical Character Recognition
Uses Gemini Vision for document text extraction
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel
import base64
import httpx

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.firebase_client import get_db, Collections
from shared.auth import get_current_user
from shared.redis_client import cache


router = APIRouter()


# ============ SCHEMAS ============

class OCRRequest(BaseModel):
    image_url: Optional[str] = None
    image_base64: Optional[str] = None
    document_type: str = "general"  # receipt, invoice, contract, id_card, business_card
    extract_fields: bool = True


class OCRResult(BaseModel):
    raw_text: str
    structured_data: Optional[dict] = None
    confidence: float
    document_type: str
    processing_time_ms: int


# ============ OCR ENDPOINTS ============

@router.post("/extract")
async def extract_text(
    request: OCRRequest,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Extract text from image using Gemini Vision"""
    import time
    start_time = time.time()
    
    try:
        from gemini_client import get_gemini_client
        client = get_gemini_client()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI client initialization failed: {str(e)}")
    
    # Get image data
    if request.image_base64:
        image_data = base64.b64decode(request.image_base64)
    elif request.image_url:
        async with httpx.AsyncClient() as http_client:
            response = await http_client.get(request.image_url)
            image_data = response.content
    else:
        raise HTTPException(status_code=400, detail="Provide image_url or image_base64")
    
    # Build extraction prompt based on document type
    prompts = {
        "receipt": """Extract all text from this receipt image. Then extract structured data:
- vendor_name
- date
- items (list with name, quantity, price)
- subtotal
- tax
- total
- payment_method""",
        
        "invoice": """Extract all text from this invoice. Then extract:
- invoice_number
- date
- due_date
- vendor_name
- vendor_address
- line_items (description, quantity, unit_price, amount)
- subtotal
- tax
- total
- payment_terms""",
        
        "contract": """Extract all text from this contract document. Identify:
- parties_involved
- contract_date
- contract_type
- key_terms
- important_dates
- signature_blocks""",
        
        "id_card": """Extract information from this ID card:
- full_name
- id_number
- date_of_birth
- address
- issue_date
- expiry_date""",
        
        "business_card": """Extract contact information:
- name
- title
- company
- phone_numbers
- email
- address
- website
- social_media""",
        
        "general": "Extract all visible text from this image, preserving the layout as much as possible."
    }
    
    prompt = prompts.get(request.document_type, prompts["general"])
    
    if request.extract_fields:
        prompt += "\n\nReturn the result as JSON with 'raw_text' and 'structured_data' fields."
    
    try:
        result = await client.analyze_image(
            image_data=image_data,
            prompt=prompt,
            task_type="complex_ocr" if request.document_type in ["contract", "invoice"] else "ocr"
        )
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Parse response
        import json
        try:
            parsed = json.loads(result["text"])
            raw_text = parsed.get("raw_text", result["text"])
            structured_data = parsed.get("structured_data")
        except json.JSONDecodeError:
            raw_text = result["text"]
            structured_data = None
        
        # Store OCR result
        db = get_db()
        ocr_record = {
            "org_code": org_code,
            "document_type": request.document_type,
            "raw_text": raw_text[:10000],  # Limit stored text
            "structured_data": structured_data,
            "model_used": result.get("model_used"),
            "processing_time_ms": processing_time,
            "created_at": datetime.utcnow().isoformat(),
            "created_by": current_user["user_id"]
        }
        
        doc_ref = db.collection(Collections.OCR_RESULTS).document()
        doc_ref.set(ocr_record)
        
        return {
            "id": doc_ref.id,
            "raw_text": raw_text,
            "structured_data": structured_data,
            "confidence": 0.95,  # Gemini doesn't provide confidence scores
            "document_type": request.document_type,
            "processing_time_ms": processing_time,
            "model_used": result.get("model_used")
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")


@router.post("/receipt")
async def process_receipt(
    file: UploadFile = File(...),
    org_code: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """Process a receipt image and extract expense data"""
    contents = await file.read()
    
    request = OCRRequest(
        image_base64=base64.b64encode(contents).decode(),
        document_type="receipt",
        extract_fields=True
    )
    
    result = await extract_text(request, org_code, current_user)
    
    # If structured data extracted, offer to create expense record
    if result.get("structured_data"):
        data = result["structured_data"]
        result["suggested_expense"] = {
            "vendor_name": data.get("vendor_name"),
            "amount": data.get("total"),
            "date": data.get("date"),
            "category": "auto_detected"
        }
    
    return result


@router.post("/invoice")
async def process_invoice(
    file: UploadFile = File(...),
    org_code: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """Process an invoice image"""
    contents = await file.read()
    
    request = OCRRequest(
        image_base64=base64.b64encode(contents).decode(),
        document_type="invoice",
        extract_fields=True
    )
    
    return await extract_text(request, org_code, current_user)


@router.post("/business-card")
async def process_business_card(
    file: UploadFile = File(...),
    org_code: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """Process a business card and extract contact info"""
    contents = await file.read()
    
    request = OCRRequest(
        image_base64=base64.b64encode(contents).decode(),
        document_type="business_card",
        extract_fields=True
    )
    
    result = await extract_text(request, org_code, current_user)
    
    # Suggest creating a contact
    if result.get("structured_data"):
        data = result["structured_data"]
        result["suggested_contact"] = {
            "name": data.get("name"),
            "email": data.get("email"),
            "phone": data.get("phone_numbers", [None])[0] if isinstance(data.get("phone_numbers"), list) else data.get("phone_numbers"),
            "company": data.get("company"),
            "title": data.get("title")
        }
    
    return result


# ============ HISTORY ============

@router.get("/history")
@cache(ttl=120)
async def get_ocr_history(
    org_code: str,
    document_type: Optional[str] = None,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get OCR processing history"""
    db = get_db()
    
    query = db.collection(Collections.OCR_RESULTS).where("org_code", "==", org_code)
    
    if document_type:
        query = query.where("document_type", "==", document_type)
    
    query = query.order_by("created_at", direction="DESCENDING").limit(limit)
    
    docs = query.stream()
    results = []
    
    for doc in docs:
        result = doc.to_dict()
        result["id"] = doc.id
        # Don't return full raw_text in list view
        result["raw_text_preview"] = result.get("raw_text", "")[:200]
        del result["raw_text"]
        results.append(result)
    
    return {"results": results, "count": len(results)}


@router.get("/history/{ocr_id}")
async def get_ocr_result(
    ocr_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific OCR result"""
    db = get_db()
    doc = db.collection(Collections.OCR_RESULTS).document(ocr_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="OCR result not found")
    
    result = doc.to_dict()
    result["id"] = doc.id
    
    return result
