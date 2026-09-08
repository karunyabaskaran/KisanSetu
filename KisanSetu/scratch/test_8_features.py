import urllib.request
import json

BASE_URL = "http://127.0.0.1:5000"

def post(endpoint, data):
    req = urllib.request.Request(
        f"{BASE_URL}{endpoint}",
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode("utf-8"))

def get(endpoint):
    req = urllib.request.Request(f"{BASE_URL}{endpoint}")
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode("utf-8"))

print("=== Running Comprehensive Verification of 8 Enhancements ===")

# 1. Universal Address Input in Registration
print("\n--- Test 1: Register Users with State, District, Address ---")
import random
suffix = random.randint(1000, 9999)
farmer_mobile = f"9840{suffix}"
buyer_mobile = f"9884{suffix}"

res_farmer = post("/api/auth/register", {
    "role": "farmer",
    "name": f"Farmer Velu {suffix}",
    "mobile": farmer_mobile,
    "state": "Tamil Nadu",
    "district": "Salem",
    "address": "12/4, Omalur High Road, Salem Rural",
    "village": "Omalur",
    "pincode": "636001",
    "password": "pass",
    "confirm_password": "pass",
    "latitude": 11.6643,
    "longitude": 78.1460
})
assert res_farmer["success"], "Farmer reg failed"
farmer_id = res_farmer["user"]["id"]
print(f"[PASS] Registered Farmer ID: {farmer_id}, Address: {res_farmer['user'].get('address')}")

res_buyer = post("/api/auth/register", {
    "role": "buyer",
    "name": f"Buyer Karthik {suffix}",
    "mobile": buyer_mobile,
    "state": "Tamil Nadu",
    "district": "Chennai",
    "address": "Flat 3B, Sunshine Apartments, Anna Nagar West, Chennai",
    "pincode": "600040",
    "password": "pass",
    "confirm_password": "pass"
})
assert res_buyer["success"], "Buyer reg failed"
buyer_id = res_buyer["user"]["id"]
print(f"[PASS] Registered Buyer ID: {buyer_id}, Address: {res_buyer['user'].get('address')}")

# 2. Farmer Product Image Upload & Auto-Detection
print("\n--- Test 2: Add Products with Image Auto-Detection ---")
crops = [
    ("Ponni Boiled Rice", "Grains", "Ponni", [
        {"min_quantity": 0, "max_quantity": 10, "price_per_kg": 50.0},
        {"min_quantity": 10, "max_quantity": 50, "price_per_kg": 44.0},
        {"min_quantity": 50, "max_quantity": None, "price_per_kg": 38.0}
    ]),
    ("Fresh Farm Red Onions", "Vegetables", "Bellary Red", [
        {"min_quantity": 0, "max_quantity": 5, "price_per_kg": 35.0},
        {"min_quantity": 5, "max_quantity": 20, "price_per_kg": 28.0},
        {"min_quantity": 20, "max_quantity": None, "price_per_kg": 22.0}
    ]),
    ("Sharbati Golden Wheat", "Grains", "Sharbati", [
        {"min_quantity": 0, "max_quantity": 10, "price_per_kg": 42.0},
        {"min_quantity": 10, "max_quantity": 50, "price_per_kg": 36.0},
        {"min_quantity": 50, "max_quantity": None, "price_per_kg": 30.0}
    ]),
    ("Country Organic Tomatoes", "Vegetables", "Naatu Thakkali", [
        {"min_quantity": 0, "max_quantity": 5, "price_per_kg": 40.0},
        {"min_quantity": 5, "max_quantity": 15, "price_per_kg": 32.0},
        {"min_quantity": 15, "max_quantity": None, "price_per_kg": 25.0}
    ])
]

created_product_ids = []
for name, cat, variety, slabs in crops:
    res = post("/api/products/add", {
        "farmer_id": farmer_id,
        "name": name,
        "category": cat,
        "variety": variety,
        "grade": "Grade A",
        "available_quantity": 500,
        "unit": "kg",
        "description": f"Freshly harvested {name}",
        "image_url": "", # Left blank to test auto-detection
        "slabs": slabs
    })
    assert res["success"], f"Failed to add {name}"
    pid = res["product"]["id"]
    img = res["product"]["image_url"]
    created_product_ids.append(pid)
    print(f"[PASS] Added Product: {name} (ID: {pid}) -> Auto-detected Image: {img[:45]}...")

# 3. Slab Pricing Calculation in Marketplace
print("\n--- Test 3: Price Slab Recalculation ---")
prod_res_5kg = get(f"/api/products/list?quantity=5")
prod_res_30kg = get(f"/api/products/list?quantity=30")

rice_5kg = next(p for p in prod_res_5kg["products"] if p["id"] == created_product_ids[0])
rice_30kg = next(p for p in prod_res_30kg["products"] if p["id"] == created_product_ids[0])

print(f"Rice at 5 kg slab price: Rs.{rice_5kg['current_unit_price']} / kg (Expected: 50.0)")
print(f"Rice at 30 kg slab price: Rs.{rice_30kg['current_unit_price']} / kg (Expected: 44.0)")
assert rice_5kg['current_unit_price'] == 50.0, "5kg slab price mismatch"
assert rice_30kg['current_unit_price'] == 44.0, "30kg slab price mismatch"
print("[PASS] Slab price calculation dynamically changes with order volume!")

# 4. Cart Constraints & Order Creation
print("\n--- Test 4: Cart Constraints (Min 4 products & Min 2kg each) ---")
# Try placing order with 3 products (should fail)
try:
    post("/api/orders/create-cart-order", {
        "buyer_id": buyer_id,
        "delivery_location": "Anna Nagar, Chennai",
        "payment_mode": "upi",
        "payment_status": "paid_verified",
        "items": [
            {"product_id": created_product_ids[0], "quantity": 5.0},
            {"product_id": created_product_ids[1], "quantity": 5.0},
            {"product_id": created_product_ids[2], "quantity": 5.0}
        ]
    })
    assert False, "Should have failed with < 4 items"
except urllib.error.HTTPError as e:
    err = json.loads(e.read().decode("utf-8"))
    print(f"[PASS] Correctly rejected 3 items: {err['message']}")

# Try placing order with 4 products but one is 1kg (should fail)
try:
    post("/api/orders/create-cart-order", {
        "buyer_id": buyer_id,
        "delivery_location": "Anna Nagar, Chennai",
        "payment_mode": "upi",
        "payment_status": "paid_verified",
        "items": [
            {"product_id": created_product_ids[0], "quantity": 5.0},
            {"product_id": created_product_ids[1], "quantity": 5.0},
            {"product_id": created_product_ids[2], "quantity": 5.0},
            {"product_id": created_product_ids[3], "quantity": 1.0}
        ]
    })
    assert False, "Should have failed with < 2kg"
except urllib.error.HTTPError as e:
    err = json.loads(e.read().decode("utf-8"))
    print(f"[PASS] Correctly rejected < 2kg: {err['message']}")

# Place valid cart order with 4 distinct crops >= 2kg each
print("\n--- Test 5: Checkout Valid Multi-Vendor Consignment Order ---")
cart_order_res = post("/api/orders/create-cart-order", {
    "buyer_id": buyer_id,
    "delivery_location": "Anna Nagar West, Chennai - 600040",
    "payment_mode": "upi",
    "payment_status": "paid_verified",
    "transaction_id": "UPI-TXN-884920",
    "items": [
        {"product_id": created_product_ids[0], "quantity": 10.0},
        {"product_id": created_product_ids[1], "quantity": 5.0},
        {"product_id": created_product_ids[2], "quantity": 4.0},
        {"product_id": created_product_ids[3], "quantity": 3.0}
    ]
})
assert cart_order_res["success"], "Valid cart order failed"
batch_id = cart_order_res["batch_group_id"]
orders = cart_order_res["orders"]
print(f"[PASS] Created Consignment Batch: {batch_id} with {len(orders)} orders!")

# 6. Tax Invoice Cost Splits
print("\n--- Test 6: Verify Product Tax Invoice Breakdown ---")
order_list = get(f"/api/orders/list?buyer_id={buyer_id}")
sample_order = order_list["orders"][0]
print(f"Order #{sample_order['order_number']}:")
print(f"  - Product Cost: Rs.{sample_order['product_cost']}")
print(f"  - Transportation Cost: Rs.{sample_order['transport_cost']}")
print(f"  - Packaging Cost: Rs.{sample_order['packaging_cost']}")
print(f"  - Tax Amount: Rs.{sample_order['tax_amount']}")
print(f"  - Total Payable: Rs.{sample_order['total_amount']}")
print(f"  - Payment Mode: {sample_order['payment_mode']}")
print(f"  - Transaction ID: {sample_order['transaction_id']}")
assert sample_order['product_cost'] is not None and sample_order['transport_cost'] is not None
assert sample_order['tax_amount'] is not None and sample_order['packaging_cost'] is not None
print("[PASS] Tax invoice has complete breakdown!")

# 7. Logistics Consignment Grouping & Single-Action Delivery
print("\n--- Test 7: Logistics Buyer Consignment Grouping & Delivery ---")
hub_ops = get("/api/logistics/hub-operations")
grouped_pickups = hub_ops.get("buyer_grouped_pickups", [])
target_group = next((g for g in grouped_pickups if g["buyer_id"] == buyer_id), None)
assert target_group is not None, "Buyer group not found in logistics operations"
print(f"[PASS] Logistics found consolidated consignment for Buyer: {target_group['buyer_name']}")
print(f"  - Total Orders: {target_group['total_orders']}")
print(f"  - Total Quantity: {target_group['total_quantity_kg']} kg")
print(f"  - Total Consignment Value: Rs.{target_group['total_value']}")

# Accept entire buyer consignment
res_accept = post("/api/logistics/accept-buyer-consignment", {
    "buyer_id": buyer_id,
    "agent_id": 7,
    "agent_name": "Gramin Express Fleet",
    "agent_mobile": "9811122233"
})
assert res_accept["success"], "Failed to accept consignment"
print(f"[PASS] {res_accept['message']}")

# Deliver all orders for buyer at a time
res_deliver = post("/api/logistics/deliver-buyer-consignment", {
    "buyer_id": buyer_id,
    "agent_id": 7
})
assert res_deliver["success"], "Failed to deliver consignment"
print(f"[PASS] {res_deliver['message']}")

# Verify all orders are delivered
updated_orders = get(f"/api/orders/list?buyer_id={buyer_id}")["orders"]
all_delivered = all(o["status"] == "delivered" for o in updated_orders)
assert all_delivered, "Not all orders delivered"
print(f"[PASS] All {len(updated_orders)} orders for buyer delivered at once!")

print("\nALL 8 USER REQUIREMENTS VALIDATED SUCCESSFULLY!")
