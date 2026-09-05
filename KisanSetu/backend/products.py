"""
KisanSetu - Product Catalog & Slab Pricing Engine
Handles product additions by farmers with custom volume-based price slabs,
and dynamic pricing calculation & state proximity search for buyers.
"""

from flask import Blueprint, request, jsonify
from backend.db import get_db

products_bp = Blueprint("products", __name__)

# Indian State Proximity / Adjacency Map for regional prioritization
STATE_ADJACENCY = {
    "Tamil Nadu": ["Kerala", "Karnataka", "Andhra Pradesh", "Puducherry"],
    "Karnataka": ["Tamil Nadu", "Kerala", "Andhra Pradesh", "Telangana", "Maharashtra", "Goa"],
    "Kerala": ["Tamil Nadu", "Karnataka"],
    "Andhra Pradesh": ["Tamil Nadu", "Karnataka", "Telangana", "Odisha", "Chhattisgarh"],
    "Telangana": ["Andhra Pradesh", "Karnataka", "Maharashtra", "Chhattisgarh"],
    "Maharashtra": ["Gujarat", "Madhya Pradesh", "Chhattisgarh", "Telangana", "Karnataka", "Goa"],
    "Gujarat": ["Rajasthan", "Madhya Pradesh", "Maharashtra"],
    "Rajasthan": ["Punjab", "Haryana", "Uttar Pradesh", "Madhya Pradesh", "Gujarat"],
    "Punjab": ["Haryana", "Himachal Pradesh", "Rajasthan", "Jammu and Kashmir"],
    "Haryana": ["Punjab", "Himachal Pradesh", "Rajasthan", "Uttar Pradesh", "Delhi"],
    "Delhi": ["Haryana", "Uttar Pradesh"],
    "Uttar Pradesh": ["Uttarakhand", "Himachal Pradesh", "Haryana", "Delhi", "Rajasthan", "Madhya Pradesh", "Chhattisgarh", "Jharkhand", "Bihar"],
    "Bihar": ["Uttar Pradesh", "Jharkhand", "West Bengal"],
    "West Bengal": ["Bihar", "Jharkhand", "Odisha", "Sikkim", "Assam"],
    "Odisha": ["West Bengal", "Jharkhand", "Chhattisgarh", "Andhra Pradesh"],
    "Madhya Pradesh": ["Rajasthan", "Uttar Pradesh", "Chhattisgarh", "Maharashtra", "Gujarat"],
    "Assam": ["West Bengal", "Meghalaya", "Arunachal Pradesh", "Nagaland", "Manipur", "Mizoram", "Tripura"]
}

def calculate_slab_price(slabs, quantity):
    """
    Finds the active price per kg for a given order quantity based on farmer's configured slabs.
    slabs is a list of dicts/tuples: [{'min_quantity': 0, 'max_quantity': 10, 'price_per_kg': 40}, ...]
    """
    if not slabs:
        return 0.0

    # Sort slabs by min_quantity
    sorted_slabs = sorted(slabs, key=lambda s: s["min_quantity"])
    chosen_price = sorted_slabs[0]["price_per_kg"]

    for slab in sorted_slabs:
        min_q = slab["min_quantity"]
        max_q = slab["max_quantity"]

        if quantity >= min_q:
            if max_q is None or quantity <= max_q:
                chosen_price = slab["price_per_kg"]
                break
            else:
                # If quantity exceeds max_q of this tier, default to this or higher tier
                chosen_price = slab["price_per_kg"]

    return chosen_price

@products_bp.route("/list", methods=["GET"])
def list_products():
    """
    Fetches all products across India.
    Supports filtering by:
    - farmer_id (for farmer's 'My Products' panel)
    - buyer_state (prioritizes buyer's state first, then adjacent states, then others)
    - search (product name or variety)
    - quantity (dynamically computes exact unit price based on slab tiers)
    - category
    """
    farmer_id = request.args.get("farmer_id")
    buyer_state = request.args.get("buyer_state", "").strip()
    search = request.args.get("search", "").strip().lower()
    category = request.args.get("category", "").strip()
    req_quantity = float(request.args.get("quantity", 1))

    conn = get_db()
    cursor = conn.cursor()

    query = "SELECT * FROM products WHERE available_quantity > 0"
    params = []

    if farmer_id:
        query += " AND farmer_id = ?"
        params.append(farmer_id)

    if category:
        query += " AND category = ?"
        params.append(category)

    if search:
        query += " AND (LOWER(name) LIKE ? OR LOWER(variety) LIKE ? OR LOWER(farmer_district) LIKE ?)"
        wildcard = f"%{search}%"
        params.extend([wildcard, wildcard, wildcard])

    cursor.execute(query, params)
    rows = cursor.fetchall()

    product_list = []
    for r in rows:
        prod = dict(r)
        # Fetch slabs for this product
        cursor.execute("""
            SELECT min_quantity, max_quantity, price_per_kg 
            FROM price_slabs 
            WHERE product_id = ? 
            ORDER BY min_quantity ASC
        """, (prod["id"],))
        slabs = [dict(s) for s in cursor.fetchall()]
        prod["slabs"] = slabs

        # Calculate unit price for requested quantity
        prod["current_unit_price"] = calculate_slab_price(slabs, req_quantity)
        prod["total_estimated_price"] = round(prod["current_unit_price"] * req_quantity, 2)

        # Proximity score for sorting:
        # 0 = Same State
        # 1 = Adjacent State
        # 2 = Other Indian States
        if buyer_state:
            f_state = prod.get("farmer_state", "")
            if f_state.lower() == buyer_state.lower():
                prod["proximity_tier"] = 0
                prod["proximity_label"] = "Local (Same State)"
            elif f_state in STATE_ADJACENCY.get(buyer_state, []):
                prod["proximity_tier"] = 1
                prod["proximity_label"] = "Neighboring State"
            else:
                prod["proximity_tier"] = 2
                prod["proximity_label"] = "Interstate"
        else:
            prod["proximity_tier"] = 0
            prod["proximity_label"] = "India"

        product_list.append(prod)

    conn.close()

    # If buyer_state provided, sort by proximity tier first, then lowest unit price
    if buyer_state:
        product_list.sort(key=lambda p: (p["proximity_tier"], p["current_unit_price"]))
    else:
        product_list.sort(key=lambda p: p["created_at"], reverse=True)

    return jsonify({
        "success": True,
        "count": len(product_list),
        "requested_quantity": req_quantity,
        "products": product_list
    })

@products_bp.route("/add", methods=["POST"])
def add_product():
    """
    Adds a new product by Farmer with custom slab pricing.
    Slabs format: [{"min_quantity": 0, "max_quantity": 10, "price_per_kg": 40}, {"min_quantity": 10, "max_quantity": 50, "price_per_kg": 35}]
    """
    data = request.get_json() or {}
    farmer_id = data.get("farmer_id")
    name = data.get("name", "").strip()
    category = data.get("category", "Grains").strip()
    variety = data.get("variety", "").strip()
    grade = data.get("grade", "Grade A").strip()
    available_quantity = float(data.get("available_quantity", 0))
    unit = data.get("unit", "kg")
    image_url = data.get("image_url", "").strip()
    description = data.get("description", "").strip()
    slabs = data.get("slabs", [])

    if not farmer_id or not name or not variety or available_quantity <= 0:
        return jsonify({"success": False, "message": "Product name, variety, and available quantity are required."}), 400

    if not slabs:
        return jsonify({"success": False, "message": "Please configure at least one pricing slab."}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Get farmer details
    cursor.execute("SELECT name, mobile, state, district FROM users WHERE id = ?", (farmer_id,))
    farmer = cursor.fetchone()
    if not farmer:
        conn.close()
        return jsonify({"success": False, "message": "Invalid farmer ID."}), 404

    # Default fallback image based on category
    if not image_url:
        defaults = {
            "Grains": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop&q=80",
            "Vegetables": "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80",
            "Fruits": "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=600&auto=format&fit=crop&q=80",
            "Pulses": "https://images.unsplash.com/photo-1515543904379-3d757afe72e4?w=600&auto=format&fit=crop&q=80",
            "Spices": "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop&q=80"
        }
        image_url = defaults.get(category, defaults["Grains"])

    try:
        cursor.execute("""
            INSERT INTO products (farmer_id, farmer_name, farmer_mobile, farmer_state, farmer_district, name, category, variety, grade, available_quantity, unit, image_url, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (farmer_id, farmer["name"], farmer["mobile"], farmer["state"], farmer["district"], name, category, variety, grade, available_quantity, unit, image_url, description))
        prod_id = cursor.lastrowid

        for s in slabs:
            min_q = float(s.get("min_quantity", 0))
            max_q = float(s.get("max_quantity")) if s.get("max_quantity") is not None and str(s.get("max_quantity")).strip() != "" else None
            price = float(s.get("price_per_kg", 0))
            cursor.execute("""
                INSERT INTO price_slabs (product_id, min_quantity, max_quantity, price_per_kg)
                VALUES (?, ?, ?, ?)
            """, (prod_id, min_q, max_q, price))

        conn.commit()
        conn.close()

        return jsonify({
            "success": True,
            "message": f"Produce '{name}' listed with {len(slabs)} slab pricing tier(s)!",
            "product_id": prod_id
        })
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)}), 500

@products_bp.route("/delete/<int:product_id>", methods=["DELETE"])
def delete_product(product_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM price_slabs WHERE product_id = ?", (product_id,))
    cursor.execute("DELETE FROM products WHERE id = ?", (product_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Product listing removed."})
