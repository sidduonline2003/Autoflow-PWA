"""
Firebase Client - Shared Firestore database connection
Single database shared across all microservices
"""

import os
import logging
from firebase_admin import credentials, initialize_app, firestore
import firebase_admin
from functools import lru_cache

logger = logging.getLogger(__name__)

# Initialize Firebase Admin SDK once
_initialized = False

def init_firebase():
    """Initialize Firebase Admin SDK with credentials"""
    global _initialized
    if _initialized or firebase_admin._apps:
        return
    
    try:
        cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        storage_bucket = os.getenv("FIREBASE_STORAGE_BUCKET", "app1bysiddu-95459.appspot.com")
        
        if not cred_path:
            # Try loading from environment variable containing JSON
            cred_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
            if cred_json:
                import json
                cred_dict = json.loads(cred_json)
                cred = credentials.Certificate(cred_dict)
            else:
                raise ValueError("No Firebase credentials found")
        else:
            cred = credentials.Certificate(cred_path)
        
        initialize_app(cred, {'storageBucket': storage_bucket})
        _initialized = True
        logger.info(f"Firebase Admin SDK initialized with bucket: {storage_bucket}")
        
    except Exception as e:
        logger.error(f"Firebase initialization error: {e}")
        raise


# Alias for backward compatibility
initialize_firebase = init_firebase


def get_db():
    """Get Firestore client instance"""
    init_firebase()
    return firestore.client()


class Collections:
    """
    Firestore collection paths - centralized for consistency across microservices
    
    Pattern: organizations/{orgId}/{collection}
    """
    
    @staticmethod
    def organizations():
        return "organizations"
    
    @staticmethod
    def org(org_id: str):
        return f"organizations/{org_id}"
    
    # === CORE COLLECTIONS ===
    @staticmethod
    def team(org_id: str):
        return f"organizations/{org_id}/team"
    
    @staticmethod
    def clients(org_id: str):
        return f"organizations/{org_id}/clients"
    
    @staticmethod
    def events(org_id: str):
        return f"organizations/{org_id}/events"
    
    @staticmethod
    def invites(org_id: str):
        return f"organizations/{org_id}/invites"
    
    @staticmethod
    def messages(org_id: str):
        return f"organizations/{org_id}/messages"
    
    @staticmethod
    def attendance(org_id: str):
        return f"organizations/{org_id}/attendance"
    
    @staticmethod
    def leave_requests(org_id: str):
        return f"organizations/{org_id}/leaveRequests"
    
    @staticmethod
    def contracts(org_id: str):
        return f"organizations/{org_id}/contracts"
    
    # === EQUIPMENT COLLECTIONS ===
    @staticmethod
    def equipment(org_id: str):
        return f"organizations/{org_id}/equipment"
    
    @staticmethod
    def checkouts(org_id: str):
        return f"organizations/{org_id}/checkouts"
    
    @staticmethod
    def maintenance(org_id: str):
        return f"organizations/{org_id}/maintenance"
    
    @staticmethod
    def external_rentals(org_id: str):
        return f"organizations/{org_id}/externalRentals"
    
    @staticmethod
    def storage_locations(org_id: str):
        return f"organizations/{org_id}/storageLocations"
    
    @staticmethod
    def storage_media(org_id: str):
        return f"organizations/{org_id}/storageMedia"
    
    # === POST-PRODUCTION COLLECTIONS ===
    @staticmethod
    def postprod_jobs(org_id: str):
        return f"organizations/{org_id}/postprodJobs"
    
    @staticmethod
    def deliverables(org_id: str):
        return f"organizations/{org_id}/deliverables"
    
    @staticmethod
    def reviews(org_id: str):
        return f"organizations/{org_id}/reviews"
    
    @staticmethod
    def milestones(org_id: str):
        return f"organizations/{org_id}/milestones"
    
    @staticmethod
    def sequences(org_id: str):
        return f"organizations/{org_id}/sequences"
    
    # === FINANCIAL COLLECTIONS ===
    @staticmethod
    def invoices(org_id: str):
        return f"organizations/{org_id}/invoices"
    
    @staticmethod
    def payments(org_id: str):
        return f"organizations/{org_id}/payments"
    
    @staticmethod
    def budgets(org_id: str):
        return f"organizations/{org_id}/budgets"
    
    @staticmethod
    def salaries(org_id: str):
        return f"organizations/{org_id}/salaries"
    
    @staticmethod
    def receipts(org_id: str):
        return f"organizations/{org_id}/receipts"
    
    @staticmethod
    def periods(org_id: str):
        return f"organizations/{org_id}/periods"
    
    @staticmethod
    def adjustments(org_id: str):
        return f"organizations/{org_id}/adjustments"
    
    @staticmethod
    def ap_bills(org_id: str):
        return f"organizations/{org_id}/apBills"
    
    @staticmethod
    def ap_payments(org_id: str):
        return f"organizations/{org_id}/apPayments"
    
    # === AI/VERIFICATION COLLECTIONS ===
    @staticmethod
    def verification_logs(org_id: str):
        return f"organizations/{org_id}/verificationLogs"
    
    @staticmethod
    def ai_analysis(org_id: str):
        return f"organizations/{org_id}/aiAnalysis"


# Convenience aliases
COLLECTIONS = Collections
