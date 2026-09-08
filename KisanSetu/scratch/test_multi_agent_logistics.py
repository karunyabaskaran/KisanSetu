import urllib.request
import json
import sqlite3

BASE = "http://127.0.0.1:5000"

def post(url, data):
    req = urllib.request.Request(
        f"{BASE}{url}",
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def get(url):
    with urllib.request.urlopen(f"{BASE}{url}") as resp:
        return json.loads(resp.read().decode("utf-8"))

conn = sqlite3.connect("kisansetu.db")
c = conn.cursor()
product_id = c.execute("SELECT id FROM products LIMIT 1").fetchone()[0]
buyer_id = c.execute("SELECT id FROM users WHERE role = 'buyer' LIMIT 1").fetchone()[0]
carrier_a_id = c.execute("SELECT id FROM users WHERE role = 'logistics' LIMIT 1").fetchone()[0]
carrier_b_id = 9988  # Second simulated logistics carrier agent
conn.close()

print(f"Using test product: {product_id}, buyer: {buyer_id}, Carrier A: {carrier_a_id}, Carrier B: {carrier_b_id}")

print("=== 1. Testing Order Creation with Hub-to-Hub Consumer Nearby Hub Resolution ===")
order_res = post("/api/orders/create", {
    "product_id": product_id,
    "buyer_id": buyer_id,
    "quantity": 15,
    "delivery_location": "Adyar, Chennai, Tamil Nadu - 600020"
})
assert order_res["success"], "Order creation failed"
order_id = order_res["order_id"]
order_num = order_res["order_number"]
print(f"Created test order #{order_num} (ID: {order_id})")

print("=== 2. Testing Shared Panel Multi-Agent Visibility before Claiming ===")
hub_ops_a = get(f"/api/logistics/hub-operations?hub_id=1&agent_id={carrier_a_id}")
hub_ops_b = get(f"/api/logistics/hub-operations?hub_id=1&agent_id={carrier_b_id}")

pickups_a = [o for o in hub_ops_a["near_pickups"] if o["id"] == order_id]
pickups_b = [o for o in hub_ops_b["near_pickups"] if o["id"] == order_id]
assert len(pickups_a) == 1, "Carrier A should see unassigned order"
assert len(pickups_b) == 1, "Carrier B should see unassigned order"
assert pickups_a[0]["is_unassigned"], "Order should be marked unassigned"
print("OK: Both Carrier A and Carrier B can see open unclaimed order in Available Pickups.")

print(f"=== 3. Testing Order Acceptance by Carrier A (ID: {carrier_a_id}) ===")
accept_res = post("/api/logistics/accept-order", {
    "order_id": order_id,
    "agent_id": carrier_a_id,
    "agent_name": "Gramin Express Logistics (Carrier A)",
    "agent_mobile": "9811122233",
    "action": "pickup"
})
assert accept_res["success"], "Carrier A accept failed"
print("OK: Carrier A accepted order successfully.")

print(f"=== 4. Testing Multi-Agent Isolation: Hidden from Carrier B (ID: {carrier_b_id})! ===")
hub_ops_a2 = get(f"/api/logistics/hub-operations?hub_id=1&agent_id={carrier_a_id}")
hub_ops_b2 = get(f"/api/logistics/hub-operations?hub_id=1&agent_id={carrier_b_id}")

pickups_a2 = [o for o in hub_ops_a2["near_pickups"] if o["id"] == order_id]
pickups_b2 = [o for o in hub_ops_b2["near_pickups"] if o["id"] == order_id]

assert len(pickups_a2) == 1, "Carrier A MUST see their accepted order"
assert pickups_a2[0]["is_assigned_to_me"] == True, "Order should be marked assigned to Carrier A"
assert len(pickups_b2) == 0, "Carrier B MUST NOT see the order accepted by Carrier A!"
print("SUCCESS: Order is EXCLUSIVELY visible to Carrier A and completely hidden from Carrier B available pickups queue!")

print("=== 5. Testing Audit Tab: Full Transparency across Network ===")
audit_b = [o for o in hub_ops_b2["all_consignments"] if o["id"] == order_id]
assert len(audit_b) == 1, "Audit tab must show all consignments"
carrier_name = audit_b[0]["assigned_agent_name"]
assert carrier_name == "Gramin Express Logistics (Carrier A)", "Audit shows assigned carrier"
print(f"OK: In Audit tab, Carrier B sees #{order_num} is assigned to: {carrier_name}")

print("=== 6. Testing Hub-to-Hub Destination Hub (Consumer Nearby Hub) ===")
dest_hub = audit_b[0]["destination_hub"]
assert dest_hub is not None, "Destination hub must be present"
print(f"Destination Hub (Consumer Nearby Hub): {dest_hub['hub_name']} (GPS: {dest_hub['latitude']}, {dest_hub['longitude']})")
print(f"Hub-to-hub Route: {audit_b[0]['hub_to_hub_route_label']}")

print("=== 7. Testing Order Pickup Verification & Stage Advance ===")
verify_pickup = post("/api/logistics/verify-and-confirm", {
    "order_id": order_id,
    "action": "confirm_pickup",
    "verified_order_number": order_num,
    "agent_name": "Gramin Express Logistics (Carrier A)"
})
assert verify_pickup["success"], "Pickup verification failed"
print("OK: Pickup confirmed and order placed in transit to consumer nearby hub.")

print("=== 8. Testing Doorstep Delivery Verification from Consumer Nearby Hub ===")
verify_delivery = post("/api/logistics/verify-and-confirm", {
    "order_id": order_id,
    "action": "confirm_delivery",
    "verified_order_number": order_num,
    "agent_name": "Gramin Express Logistics (Carrier A)"
})
assert verify_delivery["success"], "Delivery verification failed"
print("OK: Verified delivery confirmed to consumer doorstep!")

print("=== 9. Cleaning up test order ===")
conn = sqlite3.connect("kisansetu.db")
c = conn.cursor()
c.execute("DELETE FROM orders WHERE id = ?", (order_id,))
conn.commit()
conn.close()
print("=================================================================")
print(" ALL MULTI-AGENT & HUB-TO-HUB CHECKS PASSED WITH 100% SUCCESS! ")
print("=================================================================")
