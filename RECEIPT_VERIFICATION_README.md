# Cab Receipt Verification System

A comprehensive fraud-prevention system for cab receipt reimbursements in the AUTOSTUDIOFLOW application. This system helps prevent duplicate submissions, validates receipt authenticity, and provides admin tools for verification workflow.

## 🎯 Business Problem Solved

**Challenge**: Team members traveling to events by cab submit receipts for reimbursement, but there's risk of:
- Same receipt submitted by multiple team members
- Fraudulent or manipulated receipts
- Duplicate submissions for higher payouts
- Difficulty tracking and verifying large volumes of receipts

**Solution**: AI-powered receipt verification system with:
- Automatic duplicate detection using perceptual hashing
- OCR text extraction and validation
- Risk assessment scoring
- Admin dashboard for verification workflow
- Real-time fraud prevention

## 🏗️ System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Frontend │    │  FastAPI Backend │    │  Firebase Cloud │
│   Material UI    │    │  Receipt Router  │    │    Firestore    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │ API Calls             │ Store/Retrieve        │
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ OCR Service     │    │ Verification    │    │ Authentication  │
│ Text Extraction │    │ Service         │    │ Firebase Auth   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Features

### For Team Members
- **Easy Upload**: Drag-and-drop receipt image upload
- **Team Member Selection**: Associate receipts with specific team members
- **Real-time Processing**: Immediate OCR and risk assessment
- **Upload History**: View all submitted receipts and their status
- **Status Tracking**: Monitor verification progress

### For Administrators  
- **Verification Dashboard**: Comprehensive admin interface
- **Risk Assessment**: AI-powered fraud detection scoring
- **Bulk Operations**: Quick approve/reject actions
- **Comparison Tools**: Side-by-side receipt comparison for duplicates
- **Analytics**: Dashboard with submission statistics
- **Audit Trail**: Complete verification history with notes

### AI-Powered Fraud Detection
- **Duplicate Detection**: Perceptual hashing to identify similar images
- **OCR Validation**: Extract and validate receipt data (amount, date, provider)
- **Provider Recognition**: Automatic detection of Uber, Ola, Rapido receipts
- **Risk Scoring**: Comprehensive risk assessment (0-100 scale)
- **Anomaly Detection**: Identify suspicious patterns and manipulated images

## 📁 Project Structure

```
AUTOSTUDIOFLOW/
├── backend/
│   ├── routers/
│   │   └── receipts.py              # Main API endpoints
│   ├── services/
│   │   ├── ocr_service.py           # OCR text extraction
│   │   └── verification_service.py  # Fraud detection logic
│   └── main.py                      # FastAPI app with router integration
├── frontend/
│   └── src/
│       └── components/
│           ├── CabReceiptUploader.js           # User upload interface
│           └── ReceiptVerificationDashboard.js # Admin dashboard
└── test_receipt_system.py          # Integration tests
```

## 🔧 Setup Instructions

### Prerequisites
- Python 3.8+
- Node.js 14+
- Firebase project with Authentication and Firestore
- Firebase Admin SDK credentials

### Backend Setup

1. **Install dependencies**:
```bash
cd backend
pip install -r requirements.txt
```

2. **Configure Firebase**:
   - Place your Firebase Admin SDK JSON file in `backend/`
   - Update the path in `dependencies.py`

3. **Start the server**:
```bash
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

1. **Install dependencies**:
```bash
cd frontend
npm install
```

2. **Configure Firebase**:
   - Update `src/firebase.js` with your Firebase config

3. **Start the development server**:
```bash
npm start
```

## 📊 API Endpoints

### Receipt Management
- `POST /api/receipts/` - Upload new receipt
- `GET /api/receipts/` - List receipts (filtered by user role)
- `GET /api/receipts/{id}` - Get receipt details
- `PUT /api/receipts/{id}/verify` - Admin verification
- `DELETE /api/receipts/{id}` - Delete receipt

### Admin Dashboard
- `GET /api/receipts/dashboard/summary` - Get dashboard statistics

### Example API Usage

**Upload Receipt:**
```bash
curl -X POST "http://localhost:8000/api/receipts/" \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "event-001",
    "provider": "uber",
    "teamMemberId": "member-001",
    "imageData": {
      "filename": "receipt.jpg",
      "size": 12345,
      "mimeType": "image/jpeg"
    }
  }'
```

**Admin Verification:**
```bash
curl -X PUT "http://localhost:8000/api/receipts/receipt-id/verify" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "VERIFIED",
    "verificationNotes": "Receipt approved - legitimate expense"
  }'
```

## 🤖 AI Components

### OCR Service (`ocr_service.py`)
- **Text Extraction**: Processes receipt images to extract readable text
- **Provider Detection**: Identifies Uber, Ola, Rapido, and other providers
- **Data Parsing**: Extracts structured data (amount, date, ride ID)
- **Extensible**: Easy to add new providers and parsing patterns

### Verification Service (`verification_service.py`)
- **Risk Scoring**: Calculates comprehensive risk score (0-100)
- **Duplicate Detection**: Uses perceptual hashing to find similar images
- **Timestamp Validation**: Checks for reasonable submission timing
- **Image Analysis**: Detects potential manipulation or editing
- **Provider Validation**: Ensures extracted data matches provider patterns

### Risk Assessment Algorithm
```python
Risk Score = (
  Duplicate Risk (0-40) +
  Image Quality Risk (0-20) +
  Data Consistency Risk (0-20) +
  Temporal Risk (0-20)
)

Risk Levels:
- LOW_RISK: 0-30
- MEDIUM_RISK: 31-60  
- HIGH_RISK: 61-100
```

## 🧪 Testing

### Integration Tests
Run the comprehensive test suite:
```bash
python test_receipt_system.py
```

### Manual Testing Workflow
1. **User Flow**:
   - Login as regular user
   - Upload various receipt types
   - Check upload history and status

2. **Admin Flow**:
   - Login as admin user
   - Review dashboard statistics
   - Verify pending receipts
   - Test bulk operations

3. **Fraud Detection**:
   - Upload same receipt multiple times
   - Try manipulated images
   - Test with invalid data

## 🔒 Security Features

### Authentication & Authorization
- **Firebase ID Token**: Secure user authentication
- **Role-based Access**: Admin vs regular user permissions
- **Organization Isolation**: Users only see their org's data
- **Request Validation**: Input sanitization and validation

### Data Protection
- **Secure Storage**: Firestore with proper security rules
- **Image Handling**: Safe file upload and processing
- **Audit Logging**: Complete activity tracking
- **GDPR Compliance**: User data privacy controls

## 🚀 Deployment

### Production Checklist
- [ ] Configure production Firebase project
- [ ] Set up Cloud Storage for receipt images
- [ ] Configure proper Firestore security rules
- [ ] Set up monitoring and logging
- [ ] Configure HTTPS and domain
- [ ] Set up backup and disaster recovery

### Environment Variables
```bash
# Backend
FIREBASE_CREDENTIALS_PATH=path/to/service-account.json
ENVIRONMENT=production

# Frontend  
REACT_APP_FIREBASE_API_KEY=your-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-domain
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
```

## 📈 Future Enhancements

### Phase 2: Advanced OCR
- **Cloud Vision API**: Integration with Google Cloud Vision
- **Machine Learning**: Custom receipt recognition models
- **Multiple Languages**: Support for regional languages
- **Invoice Processing**: Extend to other expense types

### Phase 3: Advanced Analytics
- **Spending Patterns**: Team and individual expense analytics
- **Fraud Detection ML**: Machine learning-based fraud detection
- **Predictive Analytics**: Expense forecasting and budgeting
- **Reporting**: Automated expense reports and insights

### Phase 4: Mobile App
- **React Native**: Native mobile app for easier receipt capture
- **Camera Integration**: Direct camera capture with auto-crop
- **Offline Support**: Submit receipts without internet connection
- **Push Notifications**: Real-time verification status updates

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Common Issues

**Issue**: OCR not working
**Solution**: The current implementation uses placeholder OCR. Integrate with Google Cloud Vision API for production use.

**Issue**: Upload fails
**Solution**: Check Firebase authentication and ensure proper permissions are set.

**Issue**: Dashboard not loading
**Solution**: Verify admin role is properly set in user's Firebase custom claims.

### Getting Help
- Check the [Issues](https://github.com/your-repo/issues) page
- Review the integration test results
- Consult Firebase documentation for auth/firestore issues

---

**Built with ❤️ for AUTOSTUDIOFLOW** - Making expense management fraud-proof and efficient.
