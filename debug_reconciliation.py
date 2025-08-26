#!/usr/bin/env python3
"""
Debug script to check journal adjustments and reconciliation data flow
"""
import requests
import json
import sys
from datetime import datetime, timedelta

# Configuration
BASE_URL = "http://localhost:8000"
ORG_ID = "test-org-1"  # Update this with your actual org ID

def test_adjustments_api():
    """Test the adjustments endpoint to see what adjustments exist"""
    print("=== Testing Journal Adjustments ===")
    
    # Test get adjustments
    response = requests.get(f"{BASE_URL}/api/financial-hub/adjustments")
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Adjustments count: {len(data.get('adjustments', []))}")
        
        for adj in data.get('adjustments', []):
            print(f"  - ID: {adj.get('id')}")
            print(f"    Period: {adj.get('period', {}).get('year')}/{adj.get('period', {}).get('month')}")
            print(f"    Status: {adj.get('status')}")
            print(f"    Total: {adj.get('total')}")
            print(f"    Lines: {len(adj.get('lines', []))}")
            for line in adj.get('lines', []):
                print(f"      {line.get('bucket')}: {line.get('amount')}")
            print()
    else:
        print(f"Error: {response.text}")

def test_financial_hub_without_adjustments():
    """Test financial hub endpoint without adjustments"""
    print("=== Testing Financial Hub (No Adjustments) ===")
    
    # Get current month data
    now = datetime.now()
    from_date = now.replace(day=1).strftime('%Y-%m-%d')
    to_date = now.strftime('%Y-%m-%d')
    
    url = f"{BASE_URL}/api/financial-hub/reports/overview?from={from_date}&to={to_date}"
    response = requests.get(url)
    
    print(f"URL: {url}")
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print("Response structure:")
        print(f"  - KPIs: {list(data.get('kpis', {}).keys())}")
        print(f"  - Has 'reconciliation': {'reconciliation' in data}")
        print(f"  - Has 'adjusted': {'adjusted' in data}")
        print(f"  - Has 'adjustments': {'adjustments' in data}")
        print()
    else:
        print(f"Error: {response.text}")

def test_financial_hub_with_adjustments():
    """Test financial hub endpoint with adjustments enabled"""
    print("=== Testing Financial Hub (With Adjustments) ===")
    
    # Get current month data
    now = datetime.now()
    from_date = now.replace(day=1).strftime('%Y-%m-%d')
    to_date = now.strftime('%Y-%m-%d')
    
    url = f"{BASE_URL}/api/financial-hub/reports/overview?from={from_date}&to={to_date}&includeAdjustments=true"
    response = requests.get(url)
    
    print(f"URL: {url}")
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print("Response structure:")
        print(f"  - KPIs: {list(data.get('kpis', {}).keys())}")
        print(f"  - Has 'reconciliation': {'reconciliation' in data}")
        print(f"  - Has 'adjusted': {'adjusted' in data}")
        print(f"  - Has 'adjustments': {'adjustments' in data}")
        
        if 'reconciliation' in data:
            rec = data['reconciliation']
            print(f"\nReconciliation data:")
            print(f"  Income: cash={rec.get('income', {}).get('cash', 0)}, adj={rec.get('income', {}).get('adj', 0)}")
            print(f"  Expenses: cash={rec.get('expenses', {}).get('cash', 0)}, adj={rec.get('expenses', {}).get('adj', 0)}")
            print(f"  Net: cash={rec.get('net', {}).get('cash', 0)}, adj={rec.get('net', {}).get('adj', 0)}")
        
        if 'adjustments' in data:
            print(f"\nAdjustments summary:")
            adj_data = data['adjustments']
            print(f"  Total adjustments: {adj_data.get('total', 0)}")
            print(f"  By bucket: {adj_data.get('byBucket', {})}")
        
        print(f"\nFull response:")
        print(json.dumps(data, indent=2))
        print()
    else:
        print(f"Error: {response.text}")

def create_test_adjustment():
    """Create a test adjustment for current month"""
    print("=== Creating Test Adjustment ===")
    
    now = datetime.now()
    
    test_adjustment = {
        "period": {
            "year": now.year,
            "month": now.month
        },
        "lines": [
            {
                "bucket": "Revenue",
                "amount": 50000,
                "description": "Test revenue adjustment"
            },
            {
                "bucket": "DirectCost", 
                "amount": 10000,
                "description": "Test direct cost adjustment"
            }
        ],
        "notes": "Test adjustment for debugging reconciliation"
    }
    
    # Create adjustment
    response = requests.post(
        f"{BASE_URL}/api/financial-hub/adjustments",
        json=test_adjustment
    )
    
    print(f"Create Status: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        adjustment_id = result.get('adjustmentId')
        print(f"Created adjustment ID: {adjustment_id}")
        
        # Publish the adjustment
        publish_response = requests.post(
            f"{BASE_URL}/api/financial-hub/adjustments/{adjustment_id}/publish"
        )
        print(f"Publish Status: {publish_response.status_code}")
        if publish_response.status_code == 200:
            print("Successfully published adjustment")
            return adjustment_id
        else:
            print(f"Publish Error: {publish_response.text}")
    else:
        print(f"Create Error: {response.text}")
    
    return None

if __name__ == "__main__":
    print("Journal Adjustments Reconciliation Debug Script")
    print("=" * 50)
    
    # Test current state
    test_adjustments_api()
    test_financial_hub_without_adjustments()
    test_financial_hub_with_adjustments()
    
    # Optionally create a test adjustment
    if len(sys.argv) > 1 and sys.argv[1] == "--create-test":
        adjustment_id = create_test_adjustment()
        if adjustment_id:
            print(f"\nTest adjustment created: {adjustment_id}")
            print("Re-testing with new adjustment...")
            test_financial_hub_with_adjustments()
