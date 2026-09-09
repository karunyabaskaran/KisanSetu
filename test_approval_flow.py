"""
KisanSetu - Automated Verification of Farmer Approval & Admin Registration Restriction
Tests:
1. Admin self-registration via /api/auth/register is blocked (HTTP 403)
2. Farmer registration assigns status = 'pending'
3. Pending farmer is blocked from logging in (HTTP 403 with pending message)
4. Admin queries /api/admin/farmer-applications to see pending applicant
5. Admin approves the farmer application via /api/admin/farmer-applications/<id>/review
6. Newly approved farmer can now log in successfully
7. Rejection flow: another farmer is rejected and login returns HTTP 403 with rejection reason
8. Developer CLI manage_admin add and list functionality
"""

import json
import random
from app import app
from backend.manage_admin import add_admin, list_admins

def run_tests():
    client = app.test_client()
    random_suffix = random.randint(10000, 99999)

    print("\n--- TEST 1: Block Admin Self-Registration ---")
    admin_reg_res = client.post("/api/auth/register", json={
        "role": "admin",
        "name": "Malicious Admin",
        "mobile": f"91000{random_suffix}",
        "password": "pass",
        "confirm_password": "pass",
        "state": "Delhi",
        "district": "New Delhi",
        "address": "Office",
        "village": "Central",
        "pincode": "110001"
    })
    assert admin_reg_res.status_code == 403, f"Expected 403, got {admin_reg_res.status_code}"
    admin_reg_data = admin_reg_res.get_json()
    assert "disabled" in admin_reg_data["message"].lower() or "provisioned" in admin_reg_data["message"].lower()
    print(f"PASS: Admin registration correctly rejected with 403: {admin_reg_data['message']}")

    print("\n--- TEST 2: Register Farmer with Pending Status ---")
    farmer_mobile = f"98000{random_suffix}"
    farmer_reg_res = client.post("/api/auth/register", json={
        "role": "farmer",
        "name": f"Test Farmer {random_suffix}",
        "mobile": farmer_mobile,
        "password": "farmerpass123",
        "confirm_password": "farmerpass123",
        "state": "Tamil Nadu",
        "district": "Thanjavur",
        "village": "Papanasam",
        "address": "Plot 12, Cauvery Delta Farm Road",
        "pincode": "614205",
        "latitude": 10.9234,
        "longitude": 79.2812
    })
    assert farmer_reg_res.status_code == 200, f"Expected 200, got {farmer_reg_res.status_code}"
    farmer_reg_data = farmer_reg_res.get_json()
    assert farmer_reg_data["status"] == "pending", f"Expected pending status, got {farmer_reg_data}"
    farmer_id = farmer_reg_data["user"]["id"]
    print(f"PASS: Farmer registered with ID #{farmer_id} and status = '{farmer_reg_data['status']}'.")

    print("\n--- TEST 3: Login Attempt by Pending Farmer Must Be Blocked ---")
    login_attempt = client.post("/api/auth/login", json={
        "mobile": farmer_mobile,
        "password": "farmerpass123",
        "role": "farmer"
    })
    assert login_attempt.status_code == 403, f"Expected 403, got {login_attempt.status_code}"
    login_data = login_attempt.get_json()
    assert login_data["status"] == "pending"
    print(f"PASS: Pending farmer sign-in blocked with 403: {login_data['message']}")

    print("\n--- TEST 4: Admin Fetch Pending Farmer Applications ---")
    apps_res = client.get("/api/admin/farmer-applications?status=pending")
    assert apps_res.status_code == 200
    apps_data = apps_res.get_json()
    assert apps_data["success"] is True
    pending_apps = apps_data["applications"]
    found = any(a["id"] == farmer_id for a in pending_apps)
    assert found, f"Farmer ID #{farmer_id} not found in pending list: {pending_apps}"
    print(f"PASS: Farmer ID #{farmer_id} visible in Admin pending applications (Pending Count: {apps_data['summary']['pending_count']}).")

    print("\n--- TEST 5: Admin Approves Farmer Application ---")
    review_res = client.post(f"/api/admin/farmer-applications/{farmer_id}/review", json={
        "action": "approve"
    })
    assert review_res.status_code == 200
    review_data = review_res.get_json()
    assert review_data["success"] is True
    assert review_data["application"]["status"] == "approved"
    print(f"PASS: Admin approval successful: {review_data['message']}")

    print("\n--- TEST 6: Approved Farmer Can Now Sign In ---")
    login_approved = client.post("/api/auth/login", json={
        "mobile": farmer_mobile,
        "password": "farmerpass123",
        "role": "farmer"
    })
    assert login_approved.status_code == 200
    login_approved_data = login_approved.get_json()
    assert login_approved_data["success"] is True
    assert login_approved_data["user"]["name"] == f"Test Farmer {random_suffix}"
    print(f"PASS: Approved farmer logged in successfully as: {login_approved_data['user']['name']}")

    print("\n--- TEST 7: Rejection Flow Verification ---")
    reject_suffix = random.randint(10000, 99999)
    reject_mobile = f"97000{reject_suffix}"
    farmer2_res = client.post("/api/auth/register", json={
        "role": "farmer",
        "name": f"Farmer To Reject {reject_suffix}",
        "mobile": reject_mobile,
        "password": "pass",
        "confirm_password": "pass",
        "state": "Punjab",
        "district": "Amritsar",
        "village": "Attari",
        "address": "Border Farm",
        "pincode": "143108",
        "latitude": 31.6340,
        "longitude": 74.8723
    })
    farmer2_id = farmer2_res.get_json()["user"]["id"]

    reject_res = client.post(f"/api/admin/farmer-applications/{farmer2_id}/review", json={
        "action": "reject",
        "reason": "Duplicate registration and coordinates conflict."
    })
    assert reject_res.status_code == 200
    assert reject_res.get_json()["application"]["status"] == "rejected"

    login_rejected = client.post("/api/auth/login", json={
        "mobile": reject_mobile,
        "password": "pass",
        "role": "farmer"
    })
    assert login_rejected.status_code == 403
    rejected_data = login_rejected.get_json()
    assert "Duplicate registration and coordinates conflict" in rejected_data["message"]
    print(f"PASS: Rejected farmer sign-in blocked with reason: {rejected_data['message']}")

    print("\n--- TEST 8: Developer Admin Management Tool ---")
    new_admin_mobile = f"99111{random_suffix}"
    created = add_admin(
        name=f"Director General Agro {random_suffix}",
        mobile=new_admin_mobile,
        password="secureadminpass",
        state="Delhi",
        district="New Delhi"
    )
    assert created is True
    admin_login = client.post("/api/auth/login", json={
        "mobile": new_admin_mobile,
        "password": "secureadminpass",
        "role": "admin"
    })
    assert admin_login.status_code == 200
    assert admin_login.get_json()["success"] is True
    print(f"PASS: Developer-provisioned admin account signed in successfully!")

    print("\n=======================================================")
    print(" ALL 8 INTEGRATION TESTS PASSED SUCCESSFULLY! ")
    print("=======================================================\n")

if __name__ == "__main__":
    run_tests()
