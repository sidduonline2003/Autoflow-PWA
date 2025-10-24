from fastapi import APIRouter, Depends, HTTPException, Query
from firebase_admin import firestore
from pydantic import BaseModel, Field
from typing import List, Literal, Optional, Dict, Any
from datetime import datetime, timedelta
import traceback

from ..dependencies import get_current_user

router = APIRouter(
    prefix="/reviews",
    tags=["Post-Production Reviews"],
)

# --- Pydantic Models ---
class AttachmentItem(BaseModel):
    url: str
    type: Literal["image", "video", "document"]
    fileName: Optional[str] = None
    size: Optional[int] = None

class ReviewCreate(BaseModel):
    eventId: str
    eventName: str
    reviewerRole: Literal["admin", "editor", "client"]
    reviewType: Literal["approval", "revision_request", "comment", "rejection"]
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    content: str
    attachments: Optional[List[AttachmentItem]] = []
    assignedTo: Optional[str] = None

class ReviewUpdate(BaseModel):
    status: Optional[Literal["pending", "in_progress", "resolved", "escalated"]] = None
    content: Optional[str] = None
    priority: Optional[Literal["low", "medium", "high", "urgent"]] = None
    assignedTo: Optional[str] = None
    resolvedBy: Optional[str] = None

class ReplyCreate(BaseModel):
    content: str
    attachments: Optional[List[AttachmentItem]] = []

class BulkUpdateRequest(BaseModel):
    reviewIds: List[str]
    status: Optional[Literal["pending", "in_progress", "resolved", "escalated"]] = None
    assignedTo: Optional[str] = None

class ReviewFilters(BaseModel):
    status: Optional[List[str]] = None
    priority: Optional[List[str]] = None
    reviewerRole: Optional[List[str]] = None
    eventId: Optional[str] = None
    assignedTo: Optional[str] = None
    dateFrom: Optional[str] = None
    dateTo: Optional[str] = None
    searchText: Optional[str] = None


# --- Helper Functions ---
def get_db():
    return firestore.client()


def get_org_id(current_user: dict) -> str:
    """Extract organization ID from current user."""
    org_id = current_user.get("organizationId") or current_user.get("orgId")
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID not found for user")
    return org_id


# --- Endpoints ---

@router.post("/", status_code=201)
async def create_review(
    review_data: ReviewCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new post-production review."""
    try:
        db = get_db()
        org_id = get_org_id(current_user)
        
        # Get reviewer information
        reviewer_name = current_user.get("displayName") or current_user.get("email", "Unknown User")
        reviewer_id = current_user.get("uid")
        
        # Create review document
        review_ref = db.collection("organizations").document(org_id).collection("reviews").document()
        
        now = datetime.utcnow()
        review_doc = {
            "reviewId": review_ref.id,
            "eventId": review_data.eventId,
            "eventName": review_data.eventName,
            "reviewerName": reviewer_name,
            "reviewerId": reviewer_id,
            "reviewerRole": review_data.reviewerRole,
            "reviewType": review_data.reviewType,
            "status": "pending",
            "priority": review_data.priority,
            "content": review_data.content,
            "attachments": [att.model_dump() for att in (review_data.attachments or [])],
            "timestamp": now,
            "updatedAt": now,
            "assignedTo": review_data.assignedTo,
            "resolvedBy": None,
            "resolvedAt": None,
            "threadCount": 0,
        }
        
        review_ref.set(review_doc)
        
        return {
            "success": True,
            "reviewId": review_ref.id,
            "message": "Review created successfully",
            "review": review_doc
        }
        
    except Exception as e:
        print(f"Error creating review: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to create review: {str(e)}")


@router.get("/")
async def get_reviews(
    status: Optional[str] = Query(None, description="Filter by status (comma-separated)"),
    priority: Optional[str] = Query(None, description="Filter by priority (comma-separated)"),
    eventId: Optional[str] = Query(None, description="Filter by event ID"),
    assignedTo: Optional[str] = Query(None, description="Filter by assigned user"),
    searchText: Optional[str] = Query(None, description="Search in review content"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    sortBy: str = Query("timestamp", description="Sort field"),
    sortOrder: str = Query("desc", description="Sort order (asc/desc)"),
    current_user: dict = Depends(get_current_user)
):
    """Get paginated list of reviews with filtering and sorting."""
    try:
        db = get_db()
        org_id = get_org_id(current_user)
        
        # Base query
        query = db.collection("organizations").document(org_id).collection("reviews")
        
        # Apply filters
        if status:
            status_list = [s.strip() for s in status.split(",")]
            query = query.where("status", "in", status_list)
        
        if priority:
            priority_list = [p.strip() for p in priority.split(",")]
            query = query.where("priority", "in", priority_list)
        
        if eventId:
            query = query.where("eventId", "==", eventId)
        
        if assignedTo:
            query = query.where("assignedTo", "==", assignedTo)
        
        # Apply sorting
        direction = firestore.Query.DESCENDING if sortOrder.lower() == "desc" else firestore.Query.ASCENDING
        query = query.order_by(sortBy, direction=direction)
        
        # Apply pagination
        query = query.limit(limit).offset(offset)
        
        # Execute query
        reviews = []
        for doc in query.stream():
            review_data = doc.to_dict()
            
            # Apply search filter if provided (client-side filtering for full-text search)
            if searchText and searchText.lower() not in review_data.get("content", "").lower():
                continue
            
            # Convert timestamps to ISO format
            if "timestamp" in review_data and isinstance(review_data["timestamp"], datetime):
                review_data["timestamp"] = review_data["timestamp"].isoformat()
            if "updatedAt" in review_data and isinstance(review_data["updatedAt"], datetime):
                review_data["updatedAt"] = review_data["updatedAt"].isoformat()
            if "resolvedAt" in review_data and isinstance(review_data["resolvedAt"], datetime):
                review_data["resolvedAt"] = review_data["resolvedAt"].isoformat()
            
            reviews.append(review_data)
        
        # Get total count for pagination
        count_query = db.collection("organizations").document(org_id).collection("reviews")
        if status:
            count_query = count_query.where("status", "in", status_list)
        if priority:
            count_query = count_query.where("priority", "in", priority_list)
        if eventId:
            count_query = count_query.where("eventId", "==", eventId)
        if assignedTo:
            count_query = count_query.where("assignedTo", "==", assignedTo)
        
        total_count = len(list(count_query.stream()))
        
        return {
            "success": True,
            "reviews": reviews,
            "pagination": {
                "total": total_count,
                "limit": limit,
                "offset": offset,
                "hasMore": offset + limit < total_count
            }
        }
        
    except Exception as e:
        print(f"Error fetching reviews: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to fetch reviews: {str(e)}")


@router.get("/{review_id}")
async def get_review_by_id(
    review_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific review by ID."""
    try:
        db = get_db()
        org_id = get_org_id(current_user)
        
        review_ref = db.collection("organizations").document(org_id).collection("reviews").document(review_id)
        review_doc = review_ref.get()
        
        if not review_doc.exists:
            raise HTTPException(status_code=404, detail="Review not found")
        
        review_data = review_doc.to_dict()
        
        # Convert timestamps
        if "timestamp" in review_data and isinstance(review_data["timestamp"], datetime):
            review_data["timestamp"] = review_data["timestamp"].isoformat()
        if "updatedAt" in review_data and isinstance(review_data["updatedAt"], datetime):
            review_data["updatedAt"] = review_data["updatedAt"].isoformat()
        if "resolvedAt" in review_data and isinstance(review_data["resolvedAt"], datetime):
            review_data["resolvedAt"] = review_data["resolvedAt"].isoformat()
        
        return {
            "success": True,
            "review": review_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching review: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to fetch review: {str(e)}")


@router.patch("/{review_id}")
async def update_review(
    review_id: str,
    update_data: ReviewUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a review's status, priority, or assignment."""
    try:
        db = get_db()
        org_id = get_org_id(current_user)
        
        review_ref = db.collection("organizations").document(org_id).collection("reviews").document(review_id)
        review_doc = review_ref.get()
        
        if not review_doc.exists:
            raise HTTPException(status_code=404, detail="Review not found")
        
        # Build update data
        update_dict = {"updatedAt": datetime.utcnow()}
        
        if update_data.status is not None:
            update_dict["status"] = update_data.status
            
            # If marking as resolved, record resolver and time
            if update_data.status == "resolved":
                update_dict["resolvedBy"] = current_user.get("uid")
                update_dict["resolvedAt"] = datetime.utcnow()
        
        if update_data.content is not None:
            update_dict["content"] = update_data.content
        
        if update_data.priority is not None:
            update_dict["priority"] = update_data.priority
        
        if update_data.assignedTo is not None:
            update_dict["assignedTo"] = update_data.assignedTo
        
        if update_data.resolvedBy is not None:
            update_dict["resolvedBy"] = update_data.resolvedBy
        
        # Update document
        review_ref.update(update_dict)
        
        # Fetch updated document
        updated_review = review_ref.get().to_dict()
        
        # Convert timestamps
        if "timestamp" in updated_review and isinstance(updated_review["timestamp"], datetime):
            updated_review["timestamp"] = updated_review["timestamp"].isoformat()
        if "updatedAt" in updated_review and isinstance(updated_review["updatedAt"], datetime):
            updated_review["updatedAt"] = updated_review["updatedAt"].isoformat()
        if "resolvedAt" in updated_review and isinstance(updated_review["resolvedAt"], datetime):
            updated_review["resolvedAt"] = updated_review["resolvedAt"].isoformat()
        
        return {
            "success": True,
            "message": "Review updated successfully",
            "review": updated_review
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating review: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to update review: {str(e)}")


@router.delete("/{review_id}")
async def delete_review(
    review_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a review."""
    try:
        db = get_db()
        org_id = get_org_id(current_user)
        
        review_ref = db.collection("organizations").document(org_id).collection("reviews").document(review_id)
        review_doc = review_ref.get()
        
        if not review_doc.exists:
            raise HTTPException(status_code=404, detail="Review not found")
        
        # Delete all replies first
        replies_ref = review_ref.collection("replies")
        for reply_doc in replies_ref.stream():
            reply_doc.reference.delete()
        
        # Delete the review
        review_ref.delete()
        
        return {
            "success": True,
            "message": "Review deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting review: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to delete review: {str(e)}")


@router.post("/{review_id}/replies")
async def create_reply(
    review_id: str,
    reply_data: ReplyCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add a reply to a review."""
    try:
        db = get_db()
        org_id = get_org_id(current_user)
        
        review_ref = db.collection("organizations").document(org_id).collection("reviews").document(review_id)
        review_doc = review_ref.get()
        
        if not review_doc.exists:
            raise HTTPException(status_code=404, detail="Review not found")
        
        # Create reply
        reply_ref = review_ref.collection("replies").document()
        
        author_name = current_user.get("displayName") or current_user.get("email", "Unknown User")
        author_id = current_user.get("uid")
        
        now = datetime.utcnow()
        reply_doc = {
            "replyId": reply_ref.id,
            "reviewId": review_id,
            "authorName": author_name,
            "authorId": author_id,
            "content": reply_data.content,
            "attachments": [att.model_dump() for att in (reply_data.attachments or [])],
            "timestamp": now,
        }
        
        reply_ref.set(reply_doc)
        
        # Update thread count in review
        review_data = review_doc.to_dict()
        thread_count = review_data.get("threadCount", 0) + 1
        review_ref.update({
            "threadCount": thread_count,
            "updatedAt": now
        })
        
        return {
            "success": True,
            "replyId": reply_ref.id,
            "message": "Reply added successfully",
            "reply": reply_doc
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating reply: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to create reply: {str(e)}")


@router.get("/{review_id}/replies")
async def get_replies(
    review_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all replies for a review."""
    try:
        db = get_db()
        org_id = get_org_id(current_user)
        
        review_ref = db.collection("organizations").document(org_id).collection("reviews").document(review_id)
        review_doc = review_ref.get()
        
        if not review_doc.exists:
            raise HTTPException(status_code=404, detail="Review not found")
        
        # Get replies
        replies = []
        replies_ref = review_ref.collection("replies").order_by("timestamp")
        
        for reply_doc in replies_ref.stream():
            reply_data = reply_doc.to_dict()
            
            # Convert timestamp
            if "timestamp" in reply_data and isinstance(reply_data["timestamp"], datetime):
                reply_data["timestamp"] = reply_data["timestamp"].isoformat()
            
            replies.append(reply_data)
        
        return {
            "success": True,
            "replies": replies
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching replies: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to fetch replies: {str(e)}")


@router.post("/bulk-update")
async def bulk_update_reviews(
    bulk_data: BulkUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update multiple reviews at once."""
    try:
        db = get_db()
        org_id = get_org_id(current_user)
        
        update_dict = {"updatedAt": datetime.utcnow()}
        
        if bulk_data.status is not None:
            update_dict["status"] = bulk_data.status
            
            if bulk_data.status == "resolved":
                update_dict["resolvedBy"] = current_user.get("uid")
                update_dict["resolvedAt"] = datetime.utcnow()
        
        if bulk_data.assignedTo is not None:
            update_dict["assignedTo"] = bulk_data.assignedTo
        
        # Update each review
        updated_count = 0
        for review_id in bulk_data.reviewIds:
            review_ref = db.collection("organizations").document(org_id).collection("reviews").document(review_id)
            review_doc = review_ref.get()
            
            if review_doc.exists:
                review_ref.update(update_dict)
                updated_count += 1
        
        return {
            "success": True,
            "message": f"Updated {updated_count} reviews successfully",
            "updatedCount": updated_count
        }
        
    except Exception as e:
        print(f"Error bulk updating reviews: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to bulk update reviews: {str(e)}")


@router.get("/analytics/summary")
async def get_analytics_summary(
    current_user: dict = Depends(get_current_user)
):
    """Get analytics summary for reviews."""
    try:
        db = get_db()
        org_id = get_org_id(current_user)
        
        reviews_ref = db.collection("organizations").document(org_id).collection("reviews")
        
        # Count by status
        pending_count = len(list(reviews_ref.where("status", "==", "pending").stream()))
        in_progress_count = len(list(reviews_ref.where("status", "==", "in_progress").stream()))
        resolved_count = len(list(reviews_ref.where("status", "==", "resolved").stream()))
        escalated_count = len(list(reviews_ref.where("status", "==", "escalated").stream()))
        
        # Count resolved today
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        resolved_today = len(list(reviews_ref.where("resolvedAt", ">=", today_start).stream()))
        
        # Calculate average response time
        resolved_reviews = list(reviews_ref.where("status", "==", "resolved").limit(50).stream())
        total_response_time = 0
        count_with_time = 0
        
        for doc in resolved_reviews:
            data = doc.to_dict()
            if data.get("timestamp") and data.get("resolvedAt"):
                delta = data["resolvedAt"] - data["timestamp"]
                total_response_time += delta.total_seconds()
                count_with_time += 1
        
        avg_response_hours = (total_response_time / count_with_time / 3600) if count_with_time > 0 else 0
        
        return {
            "success": True,
            "analytics": {
                "pending": pending_count,
                "inProgress": in_progress_count,
                "resolved": resolved_count,
                "escalated": escalated_count,
                "resolvedToday": resolved_today,
                "avgResponseTimeHours": round(avg_response_hours, 1),
                "totalReviews": pending_count + in_progress_count + resolved_count + escalated_count
            }
        }
        
    except Exception as e:
        print(f"Error fetching analytics: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to fetch analytics: {str(e)}")
