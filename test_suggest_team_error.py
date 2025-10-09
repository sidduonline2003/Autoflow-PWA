import requests
import json

# Test the suggest-team endpoint
base_url = "http://localhost:8000/api"
event_id = "bc8xlh7zkVNjzyGUyBUi"
client_id = "HZNi55WkoBjabSYkJw6H"

# You'll need to add your auth token here
headers = {
    "Authorization": "Bearer YOUR_TOKEN_HERE"
}

try:
    response = requests.get(
        f"{base_url}/events/{event_id}/suggest-team?client_id={client_id}",
        headers=headers
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
except Exception as e:
    print(f"Error: {e}")
    if hasattr(e, 'response'):
        print(f"Response text: {e.response.text}")
