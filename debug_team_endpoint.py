#!/usr/bin/env python3
"""
Debug script to identify the exact issue with the team endpoint
"""

import requests
import json
import firebase_admin
from firebase_admin import credentials, firestore, auth
import os
from datetime import datetime

# Initialize Firebase Admin SDK
def init_firebase():
    try:
        # Check if Firebase is already initialized
        firebase_admin.get_app()
        print("Firebase already initialized")
    except ValueError:
        # Initialize Firebase
        cred_path = os.path.join(os.path.dirname(__file__), 'backend', 'app1bysiddu-95459-firebase-adminsdk-fbsvc-efb2c7c181.json')
        if os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            print("Firebase initialized successfully")
        else:
            print(f"Service account key not found at {cred_path}")
            return False
    return True

def debug_firebase_data():
    """Debug the Firebase data structure to understand the issue"""
    if not init_firebase():
        return
    
    db = firestore.client()
    
    # Test event ID from the error
    event_id = "3HDh804Qe1AWV6aRfITZ"
    org_id = "GE8kanHLyhPlPdnDIpPR"  # Correct org ID from discovery
    
    print(f"\n=== Debugging Event {event_id} ===")
    
    try:
        # List all clients in the organization
        clients_ref = db.collection('organizations', org_id, 'clients')
        clients = list(clients_ref.stream())
        print(f"Found {len(clients)} clients in org {org_id}")
        
        for i, client_doc in enumerate(clients):
            client_data = client_doc.to_dict()
            print(f"\nClient {i+1} ({client_doc.id}):")
            print(f"  Profile: {client_data.get('profile', {})}")
            print(f"  Auth UID: {client_data.get('profile', {}).get('authUid', 'Not found')}")
            
            # Check if this client has the requested event
            events_ref = db.collection('organizations', org_id, 'clients', client_doc.id, 'events')
            event_doc = events_ref.document(event_id).get()
            
            if event_doc.exists:
                event_data = event_doc.to_dict()
                print(f"  ✓ Has event {event_id}")
                print(f"  Event name: {event_data.get('name', 'No name')}")
                print(f"  Event title: {event_data.get('title', 'No title')}")
                print(f"  Assigned crew: {event_data.get('assignedCrew', [])}")
                print(f"  Assigned team: {event_data.get('assigned_team', [])}")
                
                # Check assigned crew details
                assigned_crew = event_data.get('assignedCrew', [])
                if assigned_crew:
                    print(f"  Crew members ({len(assigned_crew)}):")
                    for j, crew_member in enumerate(assigned_crew):
                        print(f"    {j+1}. {crew_member}")
                        
                        # Check if team member exists
                        member_user_id = crew_member.get('userId') if isinstance(crew_member, dict) else None
                        if member_user_id:
                            member_ref = db.collection('organizations', org_id, 'team').document(member_user_id)
                            member_doc = member_ref.get()
                            if member_doc.exists:
                                member_data = member_doc.to_dict()
                                print(f"       ✓ Team member found: {member_data.get('name', 'No name')}")
                            else:
                                print(f"       ✗ Team member {member_user_id} not found in team collection")
                        else:
                            print(f"       ✗ No userId in crew member data")
                            
            else:
                print(f"  ✗ No event {event_id}")
    
    except Exception as e:
        print(f"Error debugging Firebase data: {str(e)}")
        import traceback
        traceback.print_exc()

def test_endpoint_with_real_data():
    """Test the endpoint with real data structure"""
    if not init_firebase():
        return
        
    # Simulate the exact logic from the endpoint
    db = firestore.client()
    org_id = "GE8kanHLyhPlPdnDIpPR"  # Correct org ID from discovery
    event_id = "3HDh804Qe1AWV6aRfITZ"
    
    print(f"\n=== Testing Endpoint Logic ===")
    
    try:
        # Find clients (simulating the endpoint logic)
        clients_ref = db.collection('organizations', org_id, 'clients')
        clients = clients_ref.stream()
        
        event_found = False
        event_data = None
        client_id = None
        
        for client_doc in clients:
            try:
                client_data = client_doc.to_dict()
                print(f"Checking client {client_doc.id}: {client_data.get('profile', {}).get('authUid', 'No authUid')}")
                
                # For testing, let's assume we found the right client
                # (In real scenario, this would match the authenticated user's authUid)
                
                # Check if this client has the requested event
                event_ref = db.collection('organizations', org_id, 'clients', client_doc.id, 'events').document(event_id)
                event_doc = event_ref.get()
                
                if event_doc.exists:
                    event_data = event_doc.to_dict()
                    if event_data:
                        event_found = True
                        client_id = client_doc.id
                        print(f"✓ Found event in client {client_id}")
                        break
                        
            except Exception as inner_e:
                print(f"Error checking client {client_doc.id}: {str(inner_e)}")
                continue
        
        if not event_found:
            print("✗ Event not found")
            return
            
        if not event_data:
            print("✗ Event data is empty")
            return
            
        assigned_crew = event_data.get('assignedCrew', [])
        print(f"Processing {len(assigned_crew)} crew members")
        
        team_details = []
        for i, crew_member in enumerate(assigned_crew):
            try:
                if not crew_member:
                    print(f"Warning: crew_member at index {i} is None or empty")
                    continue
                    
                member_user_id = crew_member.get('userId')
                if not member_user_id:
                    print(f"Warning: crew_member at index {i} has no userId: {crew_member}")
                    continue
                
                print(f"Processing team member {i+1}: {member_user_id}")
                
                # Get team member details
                member_ref = db.collection('organizations', org_id, 'team').document(member_user_id)
                member_doc = member_ref.get()
                
                if member_doc.exists:
                    member_data = member_doc.to_dict()
                    if member_data:
                        team_member_info = {
                            "userId": member_user_id,
                            "name": crew_member.get('name', member_data.get('name', 'Unknown')),
                            "role": crew_member.get('role', 'Team Member'),
                            "skills": crew_member.get('skills', member_data.get('skills', [])),
                            "email": member_data.get('email', ''),
                            "phone": member_data.get('phone', ''),
                            "experience": member_data.get('experience', ''),
                            "portfolio": member_data.get('portfolio', ''),
                            "bio": member_data.get('bio', ''),
                            "profilePhoto": member_data.get('profilePhoto', ''),
                            "availability": member_data.get('availability', True),
                            "currentWorkload": member_data.get('currentWorkload', 0)
                        }
                        team_details.append(team_member_info)
                        print(f"  ✓ Added team member: {team_member_info['name']}")
                    else:
                        print(f"  Warning: member_data for {member_user_id} is None")
                else:
                    print(f"  Warning: Team member document {member_user_id} does not exist")
                    # Still add basic info
                    team_member_info = {
                        "userId": member_user_id,
                        "name": crew_member.get('name', 'Unknown'),
                        "role": crew_member.get('role', 'Team Member'),
                        "skills": crew_member.get('skills', []),
                        "email": '',
                        "phone": '',
                        "experience": '',
                        "portfolio": '',
                        "bio": '',
                        "profilePhoto": '',
                        "availability": True,
                        "currentWorkload": 0
                    }
                    team_details.append(team_member_info)
                    print(f"  ✓ Added basic team member info: {team_member_info['name']}")
                    
            except Exception as member_e:
                print(f"  Error processing team member {i}: {str(member_e)}")
                continue
        
        result = {
            "eventId": event_id,
            "eventName": event_data.get('name', 'Unknown Event'),
            "eventTitle": event_data.get('name', 'Unknown Event'),
            "eventDate": event_data.get('date', ''),
            "eventTime": event_data.get('time', ''),
            "team_members": team_details,
            "teamMembers": team_details,
            "teamSize": len(team_details),
            "roles": list(set([member.get('role', 'Team Member') for member in team_details if member.get('role')]))
        }
        
        print(f"\n✓ Successfully processed team details:")
        print(f"  Event: {result['eventName']}")
        print(f"  Team size: {result['teamSize']}")
        print(f"  Roles: {result['roles']}")
        
        return result
        
    except Exception as e:
        print(f"Error in endpoint logic: {str(e)}")
        import traceback
        traceback.print_exc()

def discover_organizations():
    """Discover what organizations exist in the database"""
    if not init_firebase():
        return
    
    db = firestore.client()
    print(f"\n=== Discovering Organizations ===")
    
    try:
        # List all organizations
        orgs_ref = db.collection('organizations')
        orgs = list(orgs_ref.stream())
        print(f"Found {len(orgs)} organizations:")
        
        for org_doc in orgs:
            org_data = org_doc.to_dict()
            print(f"\nOrganization: {org_doc.id}")
            print(f"  Name: {org_data.get('name', 'No name')}")
            print(f"  Owner: {org_data.get('owner', 'No owner')}")
            
            # List clients in this org
            clients_ref = db.collection('organizations', org_doc.id, 'clients')
            clients = list(clients_ref.stream())
            print(f"  Clients: {len(clients)}")
            
            for client_doc in clients:
                client_data = client_doc.to_dict()
                print(f"    Client {client_doc.id}:")
                print(f"      Profile: {client_data.get('profile', {})}")
                
                # List events for this client
                events_ref = db.collection('organizations', org_doc.id, 'clients', client_doc.id, 'events')
                events = list(events_ref.stream())
                print(f"      Events: {len(events)}")
                
                for event_doc in events:
                    event_data = event_doc.to_dict()
                    print(f"        Event {event_doc.id}: {event_data.get('name', 'No name')}")
                    if event_doc.id == "3HDh804Qe1AWV6aRfITZ":
                        print(f"        *** THIS IS THE TARGET EVENT ***")
                        print(f"        Assigned crew: {event_data.get('assignedCrew', [])}")
    
    except Exception as e:
        print(f"Error discovering organizations: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("=== Team Endpoint Debug Script ===")
    discover_organizations()
    debug_firebase_data()
    test_endpoint_with_real_data()
