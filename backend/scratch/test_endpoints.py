import sys
import os

sys.path.insert(0, r"c:\My_Data\Shares Market\Antigravity\backend")

from fastapi.testclient import TestClient
from main import app
from api.auth import get_current_user
from models.user import User

def mock_get_current_user():
    return User(id=1, username="admin")

app.dependency_overrides[get_current_user] = mock_get_current_user

def run_tests():
    client = TestClient(app)
    
    print("\nTesting GET /api/holdings...")
    response = client.get("/api/holdings")
    print("Status Code:", response.status_code)
    if response.status_code != 200:
        print("Error Response Text:", response.text)
    else:
        holdings = response.json()
        print("Success! Number of holdings returned:", len(holdings))
        
        # Find one that has mutual funds matches
        matched_positions = [h for h in holdings if h.get("mutual_funds")]
        print(f"Number of holdings matched with mutual funds: {len(matched_positions)}")
        if matched_positions:
            print("\nSample Matched Position:")
            sample = matched_positions[0]
            print(f"  Script: {sample['script']}")
            print(f"  Broker: {sample['broker']}")
            print(f"  Mutual Funds: {sample['mutual_funds']}")

if __name__ == "__main__":
    run_tests()
