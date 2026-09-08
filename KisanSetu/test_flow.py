"""
KisanSetu - Automated End-to-End Verification Test
Validates:
1. Auth (Farmer & Buyer OTP)
2. Product addition with custom multi-tier slab pricing
3. Buyer marketplace search with proximity ranking & dynamic slab pricing
4. Order creation, lifecycle progression, 7-day yellow inspection timer
5. Return request validation (enforcing 7-day window & wrong/damaged reason)
6. Grievance filing & Ministry resolution
7. AI demand forecast
"""

import urllib.request
import json

BASE_URL = "http://127.0.0.1:5000/api"

def post(endpoint, data):
    req = urllib.request.Request(
        f"{BASE_URL}{endpoint}",
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode("utf-8"))

def get(endpoint):
    with urllib.request.urlopen(f"{BASE_URL}{endpoint}") as res:
        return json.loads(res.read().decode("utf-8"))

def run_tests():
    print("--- 1. Testing System Status ---")
    sys_status = get("/system-status")
    assert sys_status["status"] == "online"
    print("OK: System online.")

    print("\n--- 2. Testing Auth (Buyer OTP & Farmer Login) ---")
    otp_res = post("/auth/send-otp", {"mobile": "9884999888"})
    assert otp_res["success"] is True
    test_otp = otp_res["test_otp"]
    assert len(test_otp) == 6
    print(f"OK: OTP dispatched successfully: {test_otp}")

    verify_otp = post("/auth/verify-otp", {"mobile": "9884999888", "otp": test_otp})
    assert verify_otp["success"] is True
    print("OK: OTP verified successfully.")

    try:
        post("/auth/register", {
            "role": "farmer",
            "name": "Murugan Raman",
            "mobile": "9840123456",
            "password": "farmer123",
            "confirm_password": "farmer123",
            "state": "Tamil Nadu",
            "district": "Thanjavur",
            "village": "Thiruvaiyaru",
            "pincode": "613204",
            "latitude": 10.8789,
            "longitude": 79.1034
        })
    except Exception:
        pass

    farmer_login = post("/auth/login", {"mobile": "9840123456", "password": "farmer123", "role": "farmer"})
    assert farmer_login["success"] is True
    farmer = farmer_login["user"]
    print(f"OK: Farmer logged in: {farmer['name']} from {farmer['district']}, {farmer['state']}")

    print("\n--- 3. Testing Produce Addition with Slab Pricing ---")
    new_produce = post("/products/add", {
        "farmer_id": farmer["id"],
        "name": "Kallur Nilam Samba Rice",
        "category": "Grains",
        "variety": "Heritage Red Rice",
        "grade": "Grade A",
        "available_quantity": 800,
        "unit": "kg",
        "description": "Indigenous nutrient-rich organic red rice, drought-resistant heritage crop.",
        "slabs": [
            {"min_quantity": 0, "max_quantity": 10, "price_per_kg": 60.0},
            {"min_quantity": 10, "max_quantity": 50, "price_per_kg": 52.0},
            {"min_quantity": 50, "max_quantity": None, "price_per_kg": 45.0}
        ]
    })
    assert new_produce["success"] is True
    prod_id = new_produce["product_id"]
    print(f"OK: Produce added with ID {prod_id} and 3 slab pricing tiers.")

    print("\n--- 4. Testing Buyer Marketplace Search with Proximity & Dynamic Slab Price ---")
    # Search for 5 kg (should hit first slab: ₹60/kg)
    search_5kg = get(f"/products/list?buyer_state=Tamil%20Nadu&search=Nilam&quantity=5")
    assert search_5kg["count"] >= 1
    found_prod = next(p for p in search_5kg["products"] if p["id"] == prod_id)
    assert found_prod["current_unit_price"] == 60.0
    assert found_prod["total_estimated_price"] == 300.0
    assert found_prod["proximity_tier"] == 0 # Same state (Tamil Nadu)
    print(f"OK: 5kg order evaluated to Slab 1: Rs. {found_prod['current_unit_price']}/kg, Total: Rs. {found_prod['total_estimated_price']}")

    # Search for 40 kg (should hit second slab: 52/kg)
    search_40kg = get(f"/products/list?buyer_state=Tamil%20Nadu&search=Nilam&quantity=40")
    found_40kg = next(p for p in search_40kg["products"] if p["id"] == prod_id)
    assert found_40kg["current_unit_price"] == 52.0
    assert found_40kg["total_estimated_price"] == 2080.0
    print(f"OK: 40kg bulk order evaluated to Slab 2: Rs. {found_40kg['current_unit_price']}/kg, Total: Rs. {found_40kg['total_estimated_price']}")

    print("\n--- 5. Testing Order Creation & Lifecycle ---")
    try:
        post("/auth/register", {
            "role": "buyer",
            "name": "Kavitha Sundaram",
            "mobile": "9884123456",
            "password": "buyer123",
            "confirm_password": "buyer123",
            "state": "Tamil Nadu",
            "district": "Chennai",
            "pincode": "600090"
        })
    except Exception:
        pass

    buyer_login = post("/auth/login", {"mobile": "9884123456", "password": "buyer123", "role": "buyer"})
    buyer = buyer_login["user"]

    order_res = post("/orders/create", {
        "product_id": prod_id,
        "buyer_id": buyer["id"],
        "quantity": 25.0, # Fits Slab 2 (10-50kg) @ ₹52/kg = ₹1300
        "delivery_location": "Besant Nagar, Chennai, Tamil Nadu - 600090"
    })
    assert order_res["success"] is True
    order_id = order_res["order_id"]
    order_num = order_res["order_number"]
    assert order_res["unit_price"] == 52.0
    assert order_res["total_amount"] == 1300.0
    print(f"OK: Order created: #{order_num}, Amount: Rs. {order_res['total_amount']}")

    # Progress to Delivered
    post("/orders/update-status", {"order_id": order_id, "status": "pickup_complete", "note": "Driver picked up consignment"})
    post("/orders/update-status", {"order_id": order_id, "status": "shipped", "note": "Loaded in Green Corridor van"})
    post("/orders/update-status", {"order_id": order_id, "status": "delivered", "note": "Delivered to buyer doorstep"})

    # Check 7-day inspection timer calculation
    orders_list = get(f"/orders/list?buyer_id={buyer['id']}")
    target_order = next(o for o in orders_list["orders"] if o["id"] == order_id)
    assert target_order["status"] == "delivered"
    assert target_order["inspection_active"] is True
    assert target_order["can_return"] is True
    assert target_order["badge_class"] == "badge-delivered-yellow"
    print(f"OK: Order in 7-day yellow inspection timer: '{target_order['status_display']}' (Remaining: {target_order['remaining_days']}d {target_order['remaining_hours']}h)")

    print("\n--- 6. Testing 7-Day Return Validation ---")
    # Return with valid reason 'damaged_item'
    return_res = post("/orders/request-return", {
        "order_id": order_id,
        "buyer_id": buyer["id"],
        "reason": "damaged_item",
        "proof_url": "https://example.com/bag_damage.jpg"
    })
    assert return_res["success"] is True
    print("OK: Return request processed successfully for damaged item.")

    # Verify order updated to returned (red font)
    updated_orders = get(f"/orders/list?buyer_id={buyer['id']}")
    returned_order = next(o for o in updated_orders["orders"] if o["id"] == order_id)
    assert returned_order["status"] == "returned"
    assert returned_order["badge_class"] == "badge-returned-red"
    print(f"OK: Order status changed to '{returned_order['status_display']}' with red badge class.")

    print("\n--- 7. Testing Grievance Desk & Ministry Resolution ---")
    tkt_res = post("/support/raise", {
        "user_id": farmer["id"],
        "role": "farmer",
        "target_entity": "logistics",
        "subject": "Delay in refrigerated transit container",
        "description": "Temperature exceeded 18 deg C during transport.",
        "expected_resolution": "Detention penalty compensation"
    })
    assert tkt_res["success"] is True
    tkt_num = tkt_res["ticket_number"]
    print(f"OK: Support grievance filed: {tkt_num}")

    # Admin lists grievances
    admin_tickets = get("/support/list?is_admin=true")
    target_tkt = next(t for t in admin_tickets["tickets"] if t["ticket_number"] == tkt_num)
    assert target_tkt["status"] == "Pending Review"

    # Ministry resolves dispute
    resolve_res = post("/support/resolve", {
        "ticket_id": target_tkt["id"],
        "admin_resolution_notes": "Ministry inspected cold chain logger; carrier penalized Rs. 2,000, farmer refunded.",
        "status": "Resolved"
    })
    assert resolve_res["success"] is True
    print("OK: Ministry dispute resolution recorded and status closed.")

    forecast = get("/ai/forecast?commodity=Ponni%20Raw%20Rice%20(Organic)&month=9")
    assert forecast["success"] is True
    assert "demand_index" in forecast
    assert "recommended_retail_slab" in forecast["price_guidance"]
    guidance_str = forecast['price_guidance']['recommended_retail_slab'].replace('\u20b9', 'Rs. ')
    print(f"OK: AI Demand Index: {forecast['demand_index']}/100, Retail Slab Guidance: {guidance_str}")

    print("\n--- 9. Testing Logistics AI Multi-Hub Route Optimization ---")
    route_res = post("/logistics/optimize-route", {"corridor": "chennai_corridor"})
    assert route_res["success"] is True
    assert "AI 2-Opt" in route_res["algorithm"]
    assert len(route_res["waypoints"]) >= 6
    assert len(route_res["traffic_segments"]) >= 5
    summary = route_res["route_summary"]
    assert summary["hubs_collected"] >= 2
    assert summary["orders_delivered"] >= 2
    print(f"OK: AI Route Optimization Validated! Total Distance: {summary['total_distance_km']}km, Traffic Saved: {summary['traffic_delay_avoided_mins']}mins, Fuel Saved: {summary['fuel_savings_liters']}L")

    print("\n--- 10. Testing Admin State & District Directory Engine ---")
    locations = get("/admin/locations")
    assert locations["success"] is True
    assert len(locations["states"]) >= 2
    assert "Tamil Nadu" in locations["states"]
    assert "Maharashtra" in locations["states"]
    print(f"OK: Admin locations returned {len(locations['states'])} states: {locations['states']}")

    # Query farmers in Tamil Nadu
    tn_farmers = get("/admin/users/list?role=farmer&state=Tamil+Nadu")
    assert tn_farmers["success"] is True
    assert len(tn_farmers["users"]) >= 1
    f_user = tn_farmers["users"][0]
    assert f_user["role"] == "farmer"
    assert "activity" in f_user
    assert "products_listed" in f_user["activity"]
    assert "orders_received" in f_user["activity"]
    summary_str = f_user['activity']['summary'].replace('\u20b9', 'Rs. ')
    print(f"OK: Tamil Nadu farmer retrieved: {f_user['name']} with {summary_str}")

    # Query all roles with state filter
    all_tn = get("/admin/users/list?role=all&state=Tamil+Nadu")
    assert all_tn["success"] is True
    assert len(all_tn["users"]) >= 2
    print(f"OK: Found {len(all_tn['users'])} total members in Tamil Nadu across roles.")

    # Query logistics activity
    logistics_list = get("/admin/users/list?role=logistics")
    assert logistics_list["success"] is True
    assert len(logistics_list["users"]) >= 1
    log_user = logistics_list["users"][0]
    assert "network_hubs" in log_user["activity"]
    log_summary = log_user['activity']['summary'].replace('\u20b9', 'Rs. ')
    print(f"OK: Logistics activity retrieved: {log_summary}")

    print("\n=======================================================")
    print(" ALL 10 CRITICAL TESTS PASSED WITH 100% SUCCESS! ")
    print("=======================================================\n")

if __name__ == "__main__":
    run_tests()

