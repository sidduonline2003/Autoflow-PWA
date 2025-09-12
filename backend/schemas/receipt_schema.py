"""
Enhanced Database Schema for Receipt Verification System

This module defines the comprehensive data structures for storing
receipt verification data including multiple hashes, ELA analysis,
manipulation detection results, and admin decision tracking.
"""

from typing import Dict, List, Any, Optional
from datetime import datetime
from dataclasses import dataclass, asdict
from enum import Enum

class RiskLevel(str, Enum):
    VERY_LOW_RISK = "VERY_LOW_RISK"
    LOW_RISK = "LOW_RISK"
    MEDIUM_RISK = "MEDIUM_RISK"
    HIGH_RISK = "HIGH_RISK"

class VerificationStatus(str, Enum):
    PENDING = "PENDING"
    AUTO_APPROVED = "AUTO_APPROVED"
    MANUAL_REVIEW = "MANUAL_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    SUSPICIOUS = "SUSPICIOUS"

class ManipulationLevel(str, Enum):
    NO_MANIPULATION = "NO_MANIPULATION"
    LOW_MANIPULATION = "LOW_MANIPULATION"
    MEDIUM_MANIPULATION = "MEDIUM_MANIPULATION"
    HIGH_MANIPULATION = "HIGH_MANIPULATION"
    ANALYSIS_ERROR = "ANALYSIS_ERROR"

class SimilarityLevel(str, Enum):
    EXACT_DUPLICATE = "EXACT_DUPLICATE"
    NEAR_DUPLICATE = "NEAR_DUPLICATE"
    SIMILAR = "SIMILAR"
    DIFFERENT = "DIFFERENT"

@dataclass
class PerceptualHashes:
    """Store multiple perceptual hash values for comprehensive similarity detection"""
    phash: str = ""           # Perceptual hash
    dhash: str = ""           # Difference hash
    ahash: str = ""           # Average hash
    whash: str = ""           # Wavelet hash
    colorhash: str = ""       # Color hash
    crop_resistant: str = ""   # Crop-resistant hash

@dataclass
class ELAAnalysis:
    """Store Error Level Analysis results"""
    manipulation_score: float = 0.0
    manipulation_level: ManipulationLevel = ManipulationLevel.NO_MANIPULATION
    ela_statistics: Dict[str, float] = None
    high_ela_regions_count: int = 0
    ela_image_data: Optional[bytes] = None  # Base64 encoded ELA difference map
    analysis_quality: int = 90

    def __post_init__(self):
        if self.ela_statistics is None:
            self.ela_statistics = {"mean": 0.0, "std": 0.0, "max": 0.0}

@dataclass
class GhostAnalysis:
    """Store JPEG Ghost analysis results"""
    ghost_detected: bool = False
    ghost_score: float = 0.0
    quality_scores: List[float] = None
    irregularity_measure: float = 0.0
    analysis_qualities: List[int] = None

    def __post_init__(self):
        if self.quality_scores is None:
            self.quality_scores = []
        if self.analysis_qualities is None:
            self.analysis_qualities = []

@dataclass
class NoiseAnalysis:
    """Store noise pattern analysis results"""
    noise_inconsistency: float = 0.0
    noise_suspicion_score: float = 0.0
    noise_blocks_analyzed: int = 0
    mean_noise_level: float = 0.0
    noise_std: float = 0.0
    suspicious_noise: bool = False

@dataclass
class ManipulationSummary:
    """Summary of all manipulation detection results"""
    is_manipulated: bool = False
    overall_score: float = 0.0
    individual_scores: List[float] = None
    confidence: int = 0

    def __post_init__(self):
        if self.individual_scores is None:
            self.individual_scores = [0.0, 0.0, 0.0]

@dataclass
class ImageFingerprints:
    """Comprehensive image fingerprinting data"""
    perceptual_hashes: PerceptualHashes = None
    cryptographic_hash: str = ""
    ela_analysis: ELAAnalysis = None
    ghost_analysis: GhostAnalysis = None
    noise_analysis: NoiseAnalysis = None
    manipulation_summary: ManipulationSummary = None

    def __post_init__(self):
        if self.perceptual_hashes is None:
            self.perceptual_hashes = PerceptualHashes()
        if self.ela_analysis is None:
            self.ela_analysis = ELAAnalysis()
        if self.ghost_analysis is None:
            self.ghost_analysis = GhostAnalysis()
        if self.noise_analysis is None:
            self.noise_analysis = NoiseAnalysis()
        if self.manipulation_summary is None:
            self.manipulation_summary = ManipulationSummary()

@dataclass
class DuplicateMatch:
    """Information about a duplicate receipt match"""
    receipt_id: str
    submitted_by: str
    submitted_at: str
    similarity_level: SimilarityLevel
    confidence: int
    min_distance: int
    best_hash_type: str
    comparison_details: Dict[str, Any] = None

    def __post_init__(self):
        if self.comparison_details is None:
            self.comparison_details = {}

@dataclass
class OCRResults:
    """Structured OCR extraction results"""
    provider: str = ""
    amount: Optional[float] = None
    rideId: Optional[str] = None  # Changed to match OCR service output, optional since not all cabs have ride IDs
    timestamp: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    locations: Optional[Dict[str, str]] = None  # Changed to match OCR service structure
    driver_name: Optional[str] = None
    vehicle_details: Optional[str] = None
    payment_method: Optional[str] = None
    extracted_text: str = ""
    confidence_scores: Dict[str, float] = None

    def __post_init__(self):
        if self.confidence_scores is None:
            self.confidence_scores = {}
        if self.locations is None:
            self.locations = {"pickup": None, "dropoff": None}

@dataclass
class RiskFactors:
    """Detailed risk assessment factors"""
    image_manipulation: Dict[str, Any] = None
    duplicates: Dict[str, Any] = None
    ocr_quality: Dict[str, Any] = None
    temporal_validation: Dict[str, Any] = None
    location_validation: Dict[str, Any] = None
    amount_validation: Dict[str, Any] = None

    def __post_init__(self):
        for field in ['image_manipulation', 'duplicates', 'ocr_quality', 
                     'temporal_validation', 'location_validation', 'amount_validation']:
            if getattr(self, field) is None:
                setattr(self, field, {})

@dataclass
class VerificationResults:
    """Comprehensive verification results"""
    risk_score: int = 0
    risk_level: RiskLevel = RiskLevel.LOW_RISK
    decision: str = "MANUAL_REVIEW"
    issues: List[str] = None
    recommendations: List[str] = None
    risk_factors: RiskFactors = None
    analysis_timestamp: str = ""
    confidence: int = 0
    exact_duplicate_detected: bool = False  # Flag for exact duplicate detection

    def __post_init__(self):
        if self.issues is None:
            self.issues = []
        if self.recommendations is None:
            self.recommendations = []
        if self.risk_factors is None:
            self.risk_factors = RiskFactors()
        if not self.analysis_timestamp:
            self.analysis_timestamp = datetime.utcnow().isoformat()

@dataclass
class AdminDecision:
    """Admin review and decision tracking"""
    reviewer_id: str = ""
    reviewer_name: str = ""
    decision: VerificationStatus = VerificationStatus.PENDING
    decision_notes: str = ""
    decision_timestamp: str = ""
    review_duration_seconds: int = 0
    additional_evidence: List[str] = None  # URLs or references to additional docs

    def __post_init__(self):
        if self.additional_evidence is None:
            self.additional_evidence = []
        if not self.decision_timestamp:
            self.decision_timestamp = datetime.utcnow().isoformat()

@dataclass
class UploadMetadata:
    """Upload and processing metadata"""
    uploader_id: str = ""
    uploader_name: str = ""
    event_id: str = ""
    team_members: List[str] = None
    upload_timestamp: str = ""
    processing_timestamp: str = ""
    image_url: str = ""
    original_filename: str = ""
    file_size: int = 0
    image_dimensions: tuple = (0, 0)
    device_info: Dict[str, str] = None
    ip_address: str = ""
    user_agent: str = ""

    def __post_init__(self):
        if self.team_members is None:
            self.team_members = []
        if self.device_info is None:
            self.device_info = {}
        if not self.upload_timestamp:
            self.upload_timestamp = datetime.utcnow().isoformat()

@dataclass
class ReceiptRecord:
    """Complete receipt record for database storage"""
    # Primary identification
    id: str = ""
    
    # Upload metadata
    upload_metadata: UploadMetadata = None
    
    # Image analysis results
    image_fingerprints: ImageFingerprints = None
    
    # OCR extraction results
    ocr_results: OCRResults = None
    
    # Duplicate detection results
    duplicate_matches: List[DuplicateMatch] = None
    
    # Risk assessment results
    verification_results: VerificationResults = None
    
    # Current status
    status: VerificationStatus = VerificationStatus.PENDING
    
    # Admin decision (if reviewed)
    admin_decision: Optional[AdminDecision] = None
    
    # Audit trail
    created_at: str = ""
    updated_at: str = ""
    version: int = 1

    def __post_init__(self):
        if self.upload_metadata is None:
            self.upload_metadata = UploadMetadata()
        if self.image_fingerprints is None:
            self.image_fingerprints = ImageFingerprints()
        if self.ocr_results is None:
            self.ocr_results = OCRResults()
        if self.duplicate_matches is None:
            self.duplicate_matches = []
        if self.verification_results is None:
            self.verification_results = VerificationResults()
        if not self.created_at:
            self.created_at = datetime.utcnow().isoformat()
        if not self.updated_at:
            self.updated_at = self.created_at

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for database storage"""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ReceiptRecord':
        """Create instance from dictionary"""
        return cls(**data)

    def update_status(self, new_status: VerificationStatus, admin_decision: Optional[AdminDecision] = None):
        """Update receipt status and admin decision"""
        self.status = new_status
        if admin_decision:
            self.admin_decision = admin_decision
        self.updated_at = datetime.utcnow().isoformat()
        self.version += 1

def create_receipt_record_from_analysis(
    upload_data: Dict[str, Any],
    image_analysis: Dict[str, Any],
    ocr_data: Dict[str, Any],
    duplicate_matches: List[Dict[str, Any]],
    verification_results: Dict[str, Any]
) -> ReceiptRecord:
    """Factory function to create a ReceiptRecord from analysis results"""
    
    # Create upload metadata
    upload_metadata = UploadMetadata(
        uploader_id=upload_data.get("uploader_id", ""),
        uploader_name=upload_data.get("uploader_name", ""),
        event_id=upload_data.get("event_id", ""),
        team_members=upload_data.get("team_members", []),
        original_filename=upload_data.get("filename", ""),
        file_size=upload_data.get("file_size", 0),
        image_dimensions=upload_data.get("dimensions", (0, 0)),
        device_info=upload_data.get("device_info", {}),
        ip_address=upload_data.get("ip_address", ""),
        user_agent=upload_data.get("user_agent", "")
    )
    
    # Create image fingerprints
    image_fingerprints = ImageFingerprints(
        perceptual_hashes=PerceptualHashes(**image_analysis.get("perceptual_hashes", {})),
        cryptographic_hash=image_analysis.get("cryptographic_hash", ""),
        ela_analysis=ELAAnalysis(**image_analysis.get("ela_analysis", {})),
        ghost_analysis=GhostAnalysis(**image_analysis.get("ghost_analysis", {})),
        noise_analysis=NoiseAnalysis(**image_analysis.get("noise_analysis", {})),
        manipulation_summary=ManipulationSummary(**image_analysis.get("manipulation_summary", {}))
    )
    
    # Create OCR results
    ocr_results = OCRResults(**ocr_data.get("data", {}))
    
    # Create duplicate matches
    duplicate_matches_objects = [
        DuplicateMatch(**match) for match in duplicate_matches
    ]
    
    # Create verification results
    print(f"DEBUG: verification_results keys: {verification_results.keys()}")
    print(f"DEBUG: verification_results: {verification_results}")
    
    # Filter out any unexpected parameters that might be in verification_results
    valid_verification_fields = {
        'risk_score', 'risk_level', 'decision', 'issues', 'recommendations', 
        'risk_factors', 'analysis_timestamp', 'confidence', 'exact_duplicate_detected'
    }
    filtered_verification_results = {
        k: v for k, v in verification_results.items() 
        if k in valid_verification_fields
    }
    print(f"DEBUG: filtered_verification_results: {filtered_verification_results}")
    
    verification_results_obj = VerificationResults(**filtered_verification_results)
    
    # Determine initial status based on decision
    decision = verification_results.get("decision", "MANUAL_REVIEW")
    if decision == "AUTO_APPROVE":
        status = VerificationStatus.AUTO_APPROVED
    elif decision == "REJECT":
        status = VerificationStatus.REJECTED
    else:
        status = VerificationStatus.PENDING
    
    return ReceiptRecord(
        id=upload_data.get("id", ""),
        upload_metadata=upload_metadata,
        image_fingerprints=image_fingerprints,
        ocr_results=ocr_results,
        duplicate_matches=duplicate_matches_objects,
        verification_results=verification_results_obj,
        status=status
    )
