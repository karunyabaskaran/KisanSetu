"""
KisanSetu - Orders & Lifecycle Engine
Implements the 7-day inspection window:
Ordered -> Pickup Complete -> Shipped -> Delivered (Yellow timer) -> Completed (Green) OR Return (Red).
Enforces return eligibility (within 7 days only, for wrong/damaged items).
"""

import datetime
import json
import uuid
from flask import Blueprint, request, jsonify
from backend.db import get_db

orders_bp = Blueprint("orders", __name__)

INSPECTION_WINDOW_DAYS = 7

def enrich_order_lifecycle(order_dict):
    """
    Computes real-time inspection window duration, remaining time,
    and returns styling attributes for UI representation.
    """
    status = order_dict.get("status", "ordered")
    delivered_at_str = order_dict.get("delivered_at")

    order_dict["can_return"] = False
    order_dict["inspection_active"] = False
    order_dict["remaining_hours"] = 0
    order_dict["remaining_days"] = 0
    order_dict["badge_class"] = "badge-ordered"

    # Status color rules
    if status == "ordered":
        order_dict["badge_class"] = "badge-ordered"
        order_dict["status_display"] = "Ordered"
    elif status == "pickup_complete":
        order_dict["badge_class"] = "badge-pickup"
        order_dict["status_display"] = "Pickup Complete"
    elif status == "shipped":
        order_dict["badge_class"] = "badge-shipped"
        order_dict["status_display"] = "Shipped"
    elif status == "delivered":
        if delivered_at_str:
            try:
                deliv_dt = datetime.datetime.strptime(delivered_at_str.split(".")[0], "%Y-%m-%d %H:%M:%S")
                now = datetime.datetime.now()
                delta = now - deliv_dt
                days_passed = delta.total_seconds() / 86400.0

                if days_passed < INSPECTION_WINDOW_DAYS:
                    # Still in 7-day yellow inspection timer period
                    remaining_sec = (INSPECTION_WINDOW_DAYS * 86400) - delta.total_seconds()
                    remaining_hours = int(remaining_sec // 3600)
                    remaining_days = int(remaining_hours // 24)
                    rem_h = remaining_hours % 24

                    order_dict["inspection_active"] = True
                    order_dict["can_return"] = True
                    order_dict["remaining_days"] = remaining_days
                    order_dict["remaining_hours"] = rem_h
                    order_dict["badge_class"] = "badge-delivered-yellow"
                    order_dict["status_display"] = f"Delivered ({remaining_days}d {rem_h}h inspection left)"
                else:
                    # 7 days elapsed -> Turn into Green Finalized
                    order_dict["badge_class"] = "badge-delivered-green"
                    order_dict["status_display"] = "Completed (7d Verified)"
            except Exception:
                order_dict["badge_class"] = "badge-delivered-yellow"
                order_dict["status_display"] = "Delivered (Inspection Active)"
                order_dict["can_return"] = True
        else:
            order_dict["badge_class"] = "badge-delivered-yellow"
            order_dict["status_display"] = "Delivered (7-Day Waiting)"
            order_dict["can_return"] = True
    elif status == "completed":
        order_dict["badge_class"] = "badge-delivered-green"
        order_dict["status_display"] = "Delivered & Verified"
    elif status == "returned":
        order_dict["badge_class"] = "badge-returned-red"
        order_dict["status_display"] = "Returned"

    # Parse tracking JSON
    try:
        order_dict["tracking_info"] = json.loads(order_dict.get("tracking_info") or "[]")
    except Exception:
        order_dict["tracking_info"] = []

    return order_dict

def resolve_nearest_hub(lat, lng, cursor):
    """Finds the ID of the nearest registered delivery hub to given GPS coordinates."""
    if lat is None or lng is None:
        cursor.execute("SELECT id FROM delivery_hubs ORDER BY id ASC LIMIT 1")
        row = cursor.fetchone()
        return row["id"] if row else 1

    cursor.execute("SELECT id, latitude, longitude FROM delivery_hubs")
    hubs = cursor.fetchall()
    if not hubs:
        return 1

    from backend.logistics_engine import calculate_haversine_distance
    best_hub_id = hubs[0]["id"]
    min_dist = float("inf")
    for h in hubs:
        try:
            dist = calculate_haversine_distance(float(lat), float(lng), float(h["latitude"]), float(h["longitude"]))
            if dist < min_dist:
                min_dist = dist
                best_hub_id = h["id"]
        except Exception:
            continue
    return best_hub_id

@orders_bp.route("/create", methods=["POST"])
def create_order():
    data = request.get_json() or {}
    product_id = data.get("product_id")
    buyer_id = data.get("buyer_id")
    quantity = float(data.get("quantity", 0))
    delivery_location = data.get("delivery_location", "").strip()

    if not product_id or not buyer_id or quantity <= 0 or not delivery_location:
        return jsonify({"success": False, "message": "Product, buyer, quantity, and delivery location are required."}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Verify product and fetch slabs
    cursor.execute("SELECT * FROM products WHERE id = ?", (product_id,))
    product = cursor.fetchone()
    if not product:
        conn.close()
        return jsonify({"success": False, "message": "Product not found."}), 404

    if product["available_quantity"] < quantity:
        conn.close()
        return jsonify({"success": False, "message": f"Only {product['available_quantity']} kg available in stock."}), 400

    # Fetch buyer
    cursor.execute("SELECT name, mobile FROM users WHERE id = ?", (buyer_id,))
    buyer = cursor.fetchone()
    if not buyer:
        conn.close()
        return jsonify({"success": False, "message": "Buyer not found."}), 404

    # Fetch slabs to determine accurate unit price
    cursor.execute("SELECT min_quantity, max_quantity, price_per_kg FROM price_slabs WHERE product_id = ? ORDER BY min_quantity ASC", (product_id,))
    slabs = [dict(s) for s in cursor.fetchall()]

    from backend.products import calculate_slab_price
    unit_price = calculate_slab_price(slabs, quantity)
    total_amount = round(unit_price * quantity, 2)

    # Resolve Farmer GPS Coordinates & Nearest Origin Hub
    cursor.execute("SELECT latitude, longitude FROM users WHERE id = ?", (product["farmer_id"],))
    f_user = cursor.fetchone()
    f_lat = f_user["latitude"] if (f_user and f_user["latitude"] is not None) else None
    f_lng = f_user["longitude"] if (f_user and f_user["longitude"] is not None) else None
    if f_lat is None or f_lng is None:
        f_lat, f_lng = resolve_location_coords(product["farmer_district"] or product["farmer_state"], (12.9352, 80.1878))

    origin_hub_id = resolve_nearest_hub(f_lat, f_lng, cursor)

    # Resolve Buyer Coordinates & Consumer's Nearby Destination Hub
    cursor.execute("SELECT latitude, longitude FROM users WHERE id = ?", (buyer_id,))
    b_user = cursor.fetchone()
    b_lat = b_user["latitude"] if (b_user and b_user["latitude"] is not None) else None
    b_lng = b_user["longitude"] if (b_user and b_user["longitude"] is not None) else None
    if b_lat is None or b_lng is None:
        b_lat, b_lng = resolve_location_coords(delivery_location, (13.0012, 80.2565))

    destination_hub_id = resolve_nearest_hub(b_lat, b_lng, cursor)
    current_hub_id = origin_hub_id

    # Hub names for initial routing metadata
    cursor.execute("SELECT hub_name FROM delivery_hubs WHERE id = ?", (origin_hub_id,))
    orig_h = cursor.fetchone()
    orig_name = orig_h["hub_name"] if orig_h else "Origin Aggregation Hub"

    cursor.execute("SELECT hub_name FROM delivery_hubs WHERE id = ?", (destination_hub_id,))
    dest_h = cursor.fetchone()
    dest_name = dest_h["hub_name"] if dest_h else "Consumer Nearby Hub"

    order_number = f"ORD-{datetime.datetime.now().year}-{uuid.uuid4().hex[:6].upper()}"
    initial_tracking = json.dumps([
        {
            "time": datetime.datetime.now().strftime("%d %b %Y, %I:%M %p"),
            "status": "Order Placed & Confirmed on KisanSetu",
            "location": f"Farm: {product['farmer_district']}, {product['farmer_state']}",
            "route_plan": f"🚜 Origin Hub: {orig_name} ➔ 🏢 Consumer Nearby Hub: {dest_name} ➔ 📦 Doorstep Delivery"
        }
    ])

    try:
        cursor.execute("""
            INSERT INTO orders (
                order_number, product_id, product_name, farmer_id, farmer_name, farmer_state,
                buyer_id, buyer_name, buyer_mobile, delivery_location, quantity, price_per_kg,
                total_amount, status, tracking_info, origin_hub_id, destination_hub_id, current_hub_id, transit_stage
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ordered', ?, ?, ?, ?, 'awaiting_pickup')
        """, (
            order_number, product["id"], product["name"], product["farmer_id"], product["farmer_name"], product["farmer_state"],
            buyer_id, buyer["name"], buyer["mobile"], delivery_location, quantity, unit_price,
            total_amount, initial_tracking, origin_hub_id, destination_hub_id, current_hub_id
        ))

        # Decrement product stock
        new_stock = product["available_quantity"] - quantity
        cursor.execute("UPDATE products SET available_quantity = ? WHERE id = ?", (new_stock, product_id))

        conn.commit()
        order_id = cursor.lastrowid
        conn.close()

        return jsonify({
            "success": True,
            "message": f"Order #{order_number} confirmed! Direct purchase from farmer {product['farmer_name']}.",
            "order_id": order_id,
            "order_number": order_number,
            "total_amount": total_amount,
            "unit_price": unit_price
        })
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)}), 500

# Dictionary of well-known Indian agricultural centers and urban delivery hubs for coordinates resolution
LOCATION_COORDS_MAP = {
    "chennai": (13.0827, 80.2707),
    "adyar": (13.0012, 80.2565),
    "anna nagar": (13.0850, 80.2101),
    "velachery": (12.9759, 80.2212),
    "t. nagar": (13.0418, 80.2341),
    "omr": (12.9010, 80.2279),
    "sholinganallur": (12.9010, 80.2279),
    "madhavaram": (13.1488, 80.2306),
    "kovilambakkam": (12.9352, 80.1878),
    "kanchipuram": (12.8342, 79.7036),
    "chengalpattu": (12.6841, 79.9836),
    "tiruvallur": (13.1439, 79.9083),
    "mumbai": (19.0760, 72.8777),
    "andheri": (19.1136, 72.8697),
    "vashi": (19.0771, 73.0006),
    "navi mumbai": (19.0330, 73.0297),
    "pune": (18.5204, 73.8567),
    "nashik": (20.0898, 73.9182),
    "bengaluru": (12.9716, 77.5946),
    "bangalore": (12.9716, 77.5946),
    "mysuru": (12.2958, 76.6394),
    "mysore": (12.2958, 76.6394),
    "hyderabad": (17.3850, 78.4867),
    "delhi": (28.6139, 77.2090),
    "new delhi": (28.6139, 77.2090),
    "coimbatore": (11.0168, 76.9558),
    "madurai": (9.9252, 78.1198),
    "salem": (11.6643, 78.1460),
    "trichy": (10.7905, 78.7047),
    "tiruchirappalli": (10.7905, 78.7047)
}

def resolve_location_coords(location_str, fallback=(13.0827, 80.2707)):
    """Resolves coordinates from text location string using fuzzy matching."""
    if not location_str:
        return fallback
    loc_lower = location_str.lower()
    for key, coords in LOCATION_COORDS_MAP.items():
        if key in loc_lower:
            return coords
    return fallback

@orders_bp.route("/list", methods=["GET"])
def list_orders():
    farmer_id = request.args.get("farmer_id")
    buyer_id = request.args.get("buyer_id")

    conn = get_db()
    cursor = conn.cursor()

    query = """
        SELECT o.*, 
               f.latitude AS f_lat, f.longitude AS f_lng, f.district AS f_district,
               b.latitude AS b_lat, b.longitude AS b_lng, b.district AS b_district
        FROM orders o
        LEFT JOIN users f ON o.farmer_id = f.id
        LEFT JOIN users b ON o.buyer_id = b.id
        WHERE 1=1
    """
    params = []

    if farmer_id:
        query += " AND o.farmer_id = ?"
        params.append(farmer_id)
    elif buyer_id:
        query += " AND o.buyer_id = ?"
        params.append(buyer_id)

    query += " ORDER BY o.id DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    orders_list = []
    for r in rows:
        order_dict = enrich_order_lifecycle(dict(r))
        # Ensure GPS coordinates are populated for OpenStreetMap navigation
        farmer_coords = (order_dict.get("f_lat"), order_dict.get("f_lng"))
        if None in farmer_coords or farmer_coords[0] is None:
            farmer_coords = resolve_location_coords(order_dict.get("farmer_state") or "Chennai", (12.9352, 80.1878))

        buyer_coords = (order_dict.get("b_lat"), order_dict.get("b_lng"))
        if None in buyer_coords or buyer_coords[0] is None:
            buyer_coords = resolve_location_coords(order_dict.get("delivery_location") or "Adyar", (13.0012, 80.2565))

        order_dict["farmer_lat"] = farmer_coords[0]
        order_dict["farmer_lng"] = farmer_coords[1]
        order_dict["buyer_lat"] = buyer_coords[0]
        order_dict["buyer_lng"] = buyer_coords[1]

        orders_list.append(order_dict)

    return jsonify({
        "success": True,
        "count": len(orders_list),
        "orders": orders_list
    })

@orders_bp.route("/update-status", methods=["POST"])
def update_status():
    """
    Progress order status:
    ordered -> pickup_complete -> shipped -> delivered
    """
    data = request.get_json() or {}
    order_id = data.get("order_id")
    new_status = data.get("status") # 'pickup_complete', 'shipped', 'delivered', 'completed'
    checkpoint_note = data.get("note", "").strip()

    valid_statuses = ["ordered", "pickup_complete", "shipped", "delivered", "completed", "returned"]
    if new_status not in valid_statuses:
        return jsonify({"success": False, "message": f"Invalid status: {new_status}"}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
    order = cursor.fetchone()
    if not order:
        conn.close()
        return jsonify({"success": False, "message": "Order not found"}), 404

    order_dict = dict(order)
    delivered_at = order_dict["delivered_at"]
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if new_status == "delivered" and not delivered_at:
        delivered_at = now_str

    # Update tracking log
    try:
        tracking = json.loads(order_dict.get("tracking_info") or "[]")
    except Exception:
        tracking = []

    note_text = checkpoint_note or f"Status updated to {new_status.replace('_', ' ').capitalize()}"
    tracking.append({
        "time": datetime.datetime.now().strftime("%d %b %Y, %I:%M %p"),
        "status": note_text,
        "location": "KisanSetu Logistics Network"
    })

    cursor.execute("""
        UPDATE orders 
        SET status = ?, delivered_at = ?, tracking_info = ?
        WHERE id = ?
    """, (new_status, delivered_at, json.dumps(tracking), order_id))

    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "message": f"Order status updated to {new_status}",
        "new_status": new_status,
        "delivered_at": delivered_at
    })

@orders_bp.route("/request-return", methods=["POST"])
def request_return():
    """
    Buyer requests return within 7 days of delivery.
    Enforces that return reason must be 'wrong_item' or 'damaged_item'.
    """
    data = request.get_json() or {}
    order_id = data.get("order_id")
    buyer_id = data.get("buyer_id")
    reason = data.get("reason", "").strip() # 'wrong_item' or 'damaged_item'
    proof_url = data.get("proof_url", "").strip()

    if reason not in ["wrong_item", "damaged_item"]:
        return jsonify({
            "success": False, 
            "message": "Return is only permitted for: 'wrong_item' (Wrong Item Delivered) or 'damaged_item' (Damaged Item Delivered)."
        }), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM orders WHERE id = ? AND buyer_id = ?", (order_id, buyer_id))
    order = cursor.fetchone()
    if not order:
        conn.close()
        return jsonify({"success": False, "message": "Order not found for this buyer."}), 404

    order_dict = dict(order)
    if order_dict["status"] != "delivered":
        conn.close()
        return jsonify({"success": False, "message": "Return can only be requested on Delivered orders."}), 400

    # Validate 7-day inspection window
    delivered_at = order_dict.get("delivered_at")
    if delivered_at:
        deliv_dt = datetime.datetime.strptime(delivered_at.split(".")[0], "%Y-%m-%d %H:%M:%S")
        if (datetime.datetime.now() - deliv_dt).total_seconds() > (INSPECTION_WINDOW_DAYS * 86400):
            conn.close()
            return jsonify({
                "success": False, 
                "message": "The 7-day return inspection window for this order has expired. Order has been finalized."
            }), 400

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Append tracking
    try:
        tracking = json.loads(order_dict.get("tracking_info") or "[]")
    except Exception:
        tracking = []
    
    reason_label = "Wrong Item Delivered" if reason == "wrong_item" else "Damaged Item Delivered"
    tracking.append({
        "time": datetime.datetime.now().strftime("%d %b %Y, %I:%M %p"),
        "status": f"Return Initiated by Buyer: {reason_label}",
        "location": "Buyer Address"
    })

    cursor.execute("""
        UPDATE orders
        SET status = 'returned',
            return_requested_at = ?,
            return_reason = ?,
            return_proof_url = ?,
            return_status = 'approved',
            tracking_info = ?
        WHERE id = ?
    """, (now_str, reason, proof_url, json.dumps(tracking), order_id))

    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "message": f"Return request processed for order #{order_dict['order_number']}. Reverse logistics dispatch triggered."
    })
