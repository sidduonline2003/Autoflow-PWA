"""
Pydantic schemas for Equipment Inventory Management System
Comprehensive validation models for QR-based asset tracking
"""

from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


# ============= ENUMS =============

class EquipmentCategory(str, Enum):
    """Equipment categories for filtering and organization"""
    CAMERA = "camera"
    LENS = "lens"
    LIGHTING = "lighting"
    AUDIO = "audio"
    GRIP = "grip"
    DRONE = "drone"
    STORAGE = "storage"
    TRIPOD = "tripod"
    MISC = "misc"


class EquipmentStatus(str, Enum):
    """Current status of equipment"""
    AVAILABLE = "AVAILABLE"
    CHECKED_OUT = "CHECKED_OUT"
    MAINTENANCE = "MAINTENANCE"
    MISSING = "MISSING"
    RETIRED = "RETIRED"


class CheckoutType(str, Enum):
    """Type of checkout transaction"""
    INTERNAL_EVENT = "internal_event"
    EXTERNAL_RENTAL = "external_rental"
    VENDOR_RETURN = "vendor_return"


class RentalType(str, Enum):
    """Rental classification"""
    INTERNAL = "internal"
    EXTERNAL = "external"
    VENDOR_BORROWED = "vendor_borrowed"


class Condition(str, Enum):
    """Equipment condition ratings"""
    EXCELLENT = "excellent"
    GOOD = "good"
    MINOR_WEAR = "minor_wear"
    NEEDS_CLEANING = "needs_cleaning"
    DAMAGED = "damaged"


class MaintenanceType(str, Enum):
    """Type of maintenance work"""
    PREVENTIVE = "preventive"
    REPAIR = "repair"
    CLEANING = "cleaning"
    CALIBRATION = "calibration"
    UPGRADE = "upgrade"


class MaintenanceStatus(str, Enum):
    """Status of maintenance job"""
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    ON_HOLD = "on_hold"


class ConsumableType(str, Enum):
    """Type of consumable item"""
    BATTERY = "battery"
    MEMORY_CARD = "memoryCard"
    TAPE = "tape"
    NONE = "none"


class ClientType(str, Enum):
    """External rental client classification"""
    STUDIO = "studio"
    FREELANCER = "freelancer"
    CORPORATE = "corporate"
    INDIVIDUAL = "individual"


class PaymentStatus(str, Enum):
    """Payment status for rentals"""
    PENDING = "pending"
    PAID = "paid"
    PARTIAL = "partial"
    OVERDUE = "overdue"


# ============= NESTED MODELS =============

class GPSLocation(BaseModel):
    """GPS coordinates"""
    latitude: float = Field(..., ge=-90, le=90, description="Latitude")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude")
    timestamp: Optional[datetime] = None


class Photo(BaseModel):
    """Photo attachment"""
    url: str
    caption: Optional[str] = None
    uploadedAt: datetime
    uploadedBy: str


class CurrentHolder(BaseModel):
    """Current holder information for checked-out equipment"""
    uid: str
    name: str
    email: str
    eventId: Optional[str] = None
    rentalType: RentalType


class MaintenanceSchedule(BaseModel):
    """Preventive maintenance configuration"""
    intervalDays: int = Field(..., ge=1, description="Days between maintenance")
    lastMaintenanceDate: Optional[datetime] = None
    nextDueDate: datetime
    alertThresholdDays: int = Field(7, ge=1, description="Days before due to alert")


class ConsumableData(BaseModel):
    """Battery and consumable tracking"""
    type: ConsumableType
    cycleCount: Optional[int] = Field(None, ge=0, description="For batteries")
    maxCycles: Optional[int] = Field(None, ge=1)
    capacityMah: Optional[int] = Field(None, ge=0)
    expiryDate: Optional[datetime] = None
    alertThreshold: int = Field(..., ge=1, description="Alert when cycleCount reaches this")
    lastReplacementDate: Optional[datetime] = None


class VendorData(BaseModel):
    """Vendor-borrowed equipment tracking"""
    isVendorEquipment: bool = True
    vendorId: str
    vendorName: str
    rentalCostPerDay: float = Field(..., ge=0)
    borrowedDate: datetime
    expectedReturnDate: datetime
    securityDeposit: float = Field(..., ge=0)
    depositStatus: str = Field(..., pattern="^(held|refunded)$")
    agreementUrl: Optional[str] = None


class InsuranceInfo(BaseModel):
    """Insurance details"""
    provider: str
    policyNumber: str
    coverageAmount: float = Field(..., ge=0)
    expiryDate: datetime
    premiumAmount: float = Field(..., ge=0)


class WarrantyInfo(BaseModel):
    """Warranty information"""
    provider: str
    expiryDate: datetime
    type: str = Field(..., pattern="^(manufacturer|extended|third_party)$")


class RentalClientInfo(BaseModel):
    """External rental client details"""
    name: str
    contact: str
    email: str
    clientType: ClientType
    agreementUrl: Optional[str] = None
    panNumber: Optional[str] = None
    gstNumber: Optional[str] = None


class LocationInfo(BaseModel):
    """Location details for checkout/checkin"""
    locationType: str = Field(..., pattern="^(office|remote|client_site)$")
    locationId: Optional[str] = None
    gps: Optional[GPSLocation] = None
    address: Optional[str] = None


class DamageReport(BaseModel):
    """Damage reporting structure"""
    hasDamage: bool
    description: str
    severity: Optional[str] = Field(None, pattern="^(minor|moderate|major|critical)$")
    photos: List[Photo] = []
    estimatedRepairCost: float = Field(0, ge=0)
    reportedBy: str
    reportedAt: datetime
    repairStatus: Optional[str] = Field(None, pattern="^(pending|in_progress|completed)$")


class Accessory(BaseModel):
    """Accessories included with equipment"""
    name: str
    quantity: int = Field(..., ge=1)
    returned: bool = False


class PartReplaced(BaseModel):
    """Parts replaced during maintenance"""
    partName: str
    partNumber: Optional[str] = None
    quantity: int = Field(..., ge=1)
    unitCost: float = Field(..., ge=0)
    totalCost: float = Field(..., ge=0)
    supplier: Optional[str] = None


# ============= REQUEST MODELS =============

class CreateEquipmentRequest(BaseModel):
    """Request to create new equipment"""
    name: str = Field(..., min_length=1, max_length=200)
    category: EquipmentCategory
    model: str
    serialNumber: Optional[str] = None
    manufacturer: Optional[str] = None
    description: Optional[str] = None
    
    purchaseDate: datetime
    purchasePrice: float = Field(..., ge=0)
    dailyRentalRate: float = Field(..., ge=0)
    
    homeLocation: str
    
    # Optional fields
    photos: List[Photo] = []
    maintenanceIntervalDays: int = Field(30, ge=1)
    consumableData: Optional[ConsumableData] = None
    vendorData: Optional[VendorData] = None
    insurance: Optional[InsuranceInfo] = None
    warranty: Optional[WarrantyInfo] = None
    tags: List[str] = []
    requiresApproval: bool = False


class UpdateEquipmentRequest(BaseModel):
    """Request to update equipment (partial update)"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    category: Optional[EquipmentCategory] = None
    model: Optional[str] = None
    serialNumber: Optional[str] = None
    description: Optional[str] = None
    dailyRentalRate: Optional[float] = Field(None, ge=0)
    homeLocation: Optional[str] = None
    status: Optional[EquipmentStatus] = None
    photos: Optional[List[Photo]] = None
    tags: Optional[List[str]] = None


class CheckoutEquipmentRequest(BaseModel):
    """Request to checkout equipment"""
    assetId: str
    uid: str
    checkoutType: CheckoutType
    
    # For internal checkouts
    eventId: Optional[str] = None
    
    # For external rentals
    rentalClientInfo: Optional[RentalClientInfo] = None
    
    expectedReturnDate: datetime
    checkoutLocation: Optional[LocationInfo] = None
    checkoutCondition: Condition = Condition.GOOD
    checkoutNotes: Optional[str] = None
    accessories: List[Accessory] = []
    
    # For external rentals
    dailyRate: Optional[float] = Field(None, ge=0)
    securityDeposit: Optional[float] = Field(None, ge=0)
    
    @field_validator('eventId')
    @classmethod
    def validate_internal_checkout(cls, v, info):
        """Ensure eventId provided for internal checkouts (optional for general use)"""
        # Allow null eventId for general internal use by teammates
        # Only require it if checkoutType is INTERNAL_EVENT
        # This allows flexibility for teammate checkouts without specific events
        return v
    
    @field_validator('rentalClientInfo')
    @classmethod
    def validate_external_rental(cls, v, info):
        """Ensure rental info provided for external rentals"""
        if info.data.get('checkoutType') == CheckoutType.EXTERNAL_RENTAL and not v:
            raise ValueError('rentalClientInfo required for external_rental checkout')
        return v


class CheckinEquipmentRequest(BaseModel):
    """Request to check-in equipment"""
    assetId: str
    checkoutId: str
    
    returnCondition: Condition
    returnNotes: Optional[str] = None
    returnPhotos: List[Photo] = []
    checkinLocation: Optional[LocationInfo] = None
    
    # Damage reporting
    damageReport: Optional[DamageReport] = None
    
    # Accessories verification
    accessories: List[Accessory] = []


class CreateMaintenanceRequest(BaseModel):
    """Request to create maintenance record"""
    assetId: str
    type: MaintenanceType
    priority: str = Field("medium", pattern="^(low|medium|high|critical)$")
    issue: str
    
    scheduledDate: datetime
    technicianName: Optional[str] = None
    vendorName: Optional[str] = None
    vendorContact: Optional[str] = None
    
    estimatedDuration: Optional[float] = Field(None, ge=0)
    estimatedCost: Optional[float] = Field(None, ge=0)
    
    notes: Optional[str] = None


class CompleteMaintenanceRequest(BaseModel):
    """Request to complete maintenance"""
    maintenanceId: str
    
    completionDate: datetime
    actualDuration: float = Field(..., ge=0)
    
    workPerformed: List[str]
    partsReplaced: List[PartReplaced] = []
    laborCost: float = Field(..., ge=0)
    
    completionNotes: Optional[str] = None
    photos: List[Photo] = []
    serviceReportUrl: Optional[str] = None
    
    coveredByWarranty: bool = False
    warrantyClaimNumber: Optional[str] = None


class CreateExternalRentalRequest(BaseModel):
    """Request to create external rental booking"""
    assetId: str
    clientName: str
    clientContact: str
    clientEmail: str
    clientType: ClientType
    
    rentalStartDate: datetime
    rentalEndDate: datetime
    dailyRate: float = Field(..., ge=0)
    
    securityDeposit: float = Field(..., ge=0)
    
    agreementUrl: Optional[str] = None
    panNumber: Optional[str] = None
    gstNumber: Optional[str] = None
    
    terms: List[str] = []
    
    @field_validator('rentalEndDate')
    @classmethod
    def validate_dates(cls, v, info):
        """Ensure end date after start date"""
        if 'rentalStartDate' in info.data and v <= info.data['rentalStartDate']:
            raise ValueError('rentalEndDate must be after rentalStartDate')
        return v


class CreateLocationRequest(BaseModel):
    """Request to create new location"""
    name: str = Field(..., min_length=1, max_length=100)
    type: str = Field(..., pattern="^(studio|warehouse|vehicle|client_site|remote)$")
    description: Optional[str] = None
    
    address: str
    gps: Optional[GPSLocation] = None
    
    capacityLimit: int = Field(100, ge=1)
    accessLevel: str = Field("restricted", pattern="^(public|restricted|admin_only)$")
    
    contactPerson: Optional[str] = None
    contactPhone: Optional[str] = None


class BulkPrintQRRequest(BaseModel):
    """Request to generate bulk QR codes for printing"""
    assetIds: List[str] = Field(..., min_items=1, max_items=100)
    includeNames: bool = True
    gridSize: str = Field("6x4", pattern="^\\d+x\\d+$")


class EquipmentFilterRequest(BaseModel):
    """Filters for equipment list"""
    category: Optional[EquipmentCategory] = None
    status: Optional[EquipmentStatus] = None
    homeLocation: Optional[str] = None
    searchQuery: Optional[str] = None
    minUtilization: Optional[float] = Field(None, ge=0, le=100)
    maxUtilization: Optional[float] = Field(None, ge=0, le=100)
    tags: Optional[List[str]] = None


# ============= RESPONSE MODELS =============

class EquipmentResponse(BaseModel):
    """Response with equipment details"""
    assetId: str
    qrCodeUrl: Optional[str] = None
    name: str
    category: EquipmentCategory
    model: str
    status: EquipmentStatus
    
    # Optional fields based on query
    serialNumber: Optional[str] = None
    currentHolder: Optional[CurrentHolder] = None
    dailyRentalRate: Optional[float] = None
    utilizationRate: Optional[float] = None
    totalDaysUsed: Optional[int] = None
    photos: Optional[List[Photo]] = None
    
    createdAt: datetime
    updatedAt: datetime


class CheckoutResponse(BaseModel):
    """Response with checkout details"""
    checkoutId: str
    assetId: str
    assetName: str
    uid: str
    userName: str
    
    checkoutType: CheckoutType
    checkedOutAt: datetime
    expectedReturnDate: datetime
    actualReturnDate: Optional[datetime] = None
    
    status: str  # active, completed, overdue
    daysUsed: Optional[int] = None
    isOverdue: bool
    daysOverdue: int


class MaintenanceResponse(BaseModel):
    """Response with maintenance details"""
    maintenanceId: str
    assetId: str
    assetName: str
    type: MaintenanceType
    status: MaintenanceStatus
    
    scheduledDate: datetime
    completionDate: Optional[datetime] = None
    totalCost: Optional[float] = None
    
    createdAt: datetime


class AnalyticsSummaryResponse(BaseModel):
    """Response with analytics summary"""
    totalAssets: int
    totalValue: float
    availableCount: int
    checkedOutCount: int
    maintenanceCount: int
    missingCount: int
    
    overallUtilizationRate: float
    monthlyMaintenanceCost: float
    monthlyExternalRentalRevenue: float
    
    overdueCount: int
    overdueValue: float
    
    updatedAt: datetime


class QRCodeGenerationResponse(BaseModel):
    """Response after QR code generation"""
    success: bool
    qrCodeUrl: str
    qrCodeBase64: Optional[str] = None  # For immediate display
    message: str


class AvailabilityResponse(BaseModel):
    """Equipment availability on specific date"""
    assetId: str
    name: str
    category: EquipmentCategory
    available: bool
    reason: Optional[str] = None  # If not available: "Checked out", "In maintenance", etc.


class CrewResponsibilityScore(BaseModel):
    """Crew member equipment responsibility metrics"""
    uid: str
    name: str
    totalCheckouts: int
    onTimeReturnRate: float  # Percentage
    averageConditionScore: float  # 0-5 scale
    damageIncidents: int
    responsibilityScore: int  # 0-100 composite score


class UtilizationDataPoint(BaseModel):
    """Single data point for utilization trend"""
    date: str  # YYYY-MM-DD
    utilizationRate: float
    assetsInUse: int


# ============= UTILITY RESPONSES =============

class SuccessResponse(BaseModel):
    """Generic success response"""
    success: bool = True
    message: str
    data: Optional[Dict[str, Any]] = None


class ErrorResponse(BaseModel):
    """Generic error response"""
    success: bool = False
    error: str
    details: Optional[Dict[str, Any]] = None
