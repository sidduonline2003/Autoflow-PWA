#!/usr/bin/env python3
"""Create events for today's date so the dashboard has data to show"""

import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, date

# Initialize Firebase
cred = credentials.Certificate('/Users/siddudev/Development/AUTOSTUDIOFLOW/backend/app1bysiddu-95459-firebase-adminsdk-fbsvc-efb2c7c181.json')
try:
    firebase_admin.initialize_app(cred)
except:
    pass  # Already initialized

db = firestore.client()

# Organization ID
org_id = "7iDHGFwmEtYuSsko9Mle"

# Get today's date
today = date.today().isoformat()  # Format: 2025-11-26
print(f"Creating events for today: {today}")

# Get all clients
clients_ref = db.collection('organizations', org_id, 'clients')
clients = list(clients_ref.stream())

print(f"Found {len(clients)} clients")

# Sample events to create
events_to_create = [
    {
        "name": "Corporate Event Photoshoot",
        "date": today,
        "time": "09:00 AM - 05:00 PM",
        "venue": "Hyderabad Convention Center",
        "venueCoordinates": {
            "latitude": 17.4401,
            "longitude": 78.3489
        },
        "status": "ongoing",
        "type": "Corporate",
        "assignedCrew": [],
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP
    },
    {
        "name": "Wedding Reception",
        "date": today,
        "time": "06:00 PM - 11:00 PM",
        "venue": "Taj Falaknuma Palace",
        "venueCoordinates": {
            "latitude": 17.3313,
            "longitude": 78.4573
        },
        "status": "scheduled",
        "type": "Wedding",
        "assignedCrew": [],
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP
    },
    {
        "name": "Product Launch Event",
        "date": today,
        "time": "02:00 PM - 06:00 PM",
        "venue": "HICC Novotel",
        "venueCoordinates": {
            "latitude": 17.4555,
            "longitude": 78.3726
        },
        "status": "ongoing",
        "type": "Corporate",
        "assignedCrew": [],
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP
    }
]

# Get team members to assign
team_ref = db.collection('organizations', org_id, 'team')
team_members = list(team_ref.stream())
print(f"Found {len(team_members)} team members")

team_ids = [member.id for member in team_members]

# Create events for the first client
if clients:
    client = clients[0]
    client_data = client.to_dict()
    print(f"\nCreating events for client: {client_data.get('name', client.id)}")
    
    events_ref = db.collection('organizations', org_id, 'clients', client.id, 'events')
    
    for i, event_data in enumerate(events_to_create):
        # Assign some team members to each event
        if team_ids:
            event_data['assignedCrew'] = team_ids[:min(3, len(team_ids))]
        
        # Create the event
        doc_ref = events_ref.add(event_data)
        print(f"  ✓ Created event: {event_data['name']} (ID: {doc_ref[1].id})")

print("\n" + "="*50)
print("Events created successfully!")
print("="*50)

# Verify by listing today's events
print("\nVerifying today's events:")
for client in clients:
    events_ref = db.collection('organizations', org_id, 'clients', client.id, 'events')
    query = events_ref.where('date', '==', today)
    events = list(query.stream())
    if events:
        client_data = client.to_dict()
        print(f"\n{client_data.get('name', client.id)}:")
        for event in events:
            event_data = event.to_dict()
            print(f"  - {event_data.get('name')} ({event_data.get('status')}) at {event_data.get('venue')}")
