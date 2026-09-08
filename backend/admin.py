"""
KisanSetu - Ministry / Administrator Controller & Directory Engine
Endpoints:
1. GET /api/admin/locations - Distinct states and districts for filters
2. GET /api/admin/users/list - Filter users by role, state, district, and search query, enriched with live activity metrics
"""

from flask import Blueprint, request, jsonify
from backend.db import get_db

admin_bp = Blueprint("admin", __name__)

@admin_bp.route("/locations", methods=["GET"])
def get_locations():
    """
    Returns available States and their corresponding Districts in the database
    to dynamically populate admin filter dropdowns.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT DISTINCT state, district 
        FROM users 
        WHERE state IS NOT NULL AND state != ''
        ORDER BY state ASC, district ASC
    """)
    rows = cursor.fetchall()
    conn.close()

    state_districts = {}
    for r in rows:
        st = r["state"].strip()
        dt = (r["district"] or "").strip()
        if st not in state_districts:
            state_districts[st] = []
        if dt and dt not in state_districts[st]:
            state_districts[st].append(dt)

    return jsonify({
        "success": True,
        "states": sorted(list(state_districts.keys())),
        "state_districts": state_districts
    })

@admin_bp.route("/users/list", methods=["GET"])
def get_users_list():
    """
    Fetch list of users with multi-dimensional filters:
    - role: 'all', 'farmer', 'buyer', 'logistics' (default: 'farmer')
    - state: filter by state name
    - district: filter by district name
    - search: keyword search across name, mobile, village
    Enriches each record with operational activity metrics (orders, earnings, products).
    """
    role = request.args.get("role", "all").strip().lower()
    state = request.args.get("state", "").strip()
    district = request.args.get("district", "").strip()
    search = request.args.get("search", "").strip().lower()

    conn = get_db()
    cursor = conn.cursor()

    # Base query
    query = """
        SELECT id, name, mobile, role, state, district, village, pincode, latitude, longitude, created_at 
        FROM users 
        WHERE 1=1
    """
    params = []

    if role and role != "all":
        query += " AND role = ?"
        params.append(role)

    if state:
        query += " AND LOWER(state) = LOWER(?)"
        params.append(state)

    if district:
        query += " AND LOWER(district) = LOWER(?)"
        params.append(district)

    if search:
        query += " AND (LOWER(name) LIKE ? OR mobile LIKE ? OR LOWER(village) LIKE ? OR LOWER(district) LIKE ?)"
        search_param = f"%{search}%"
        params.extend([search_param, search_param, search_param, search_param])

    query += " ORDER BY state ASC, district ASC, name ASC"

    cursor.execute(query, params)
    user_rows = [dict(r) for r in cursor.fetchall()]

    # Fetch total summary counters across entire system
    cursor.execute("SELECT role, COUNT(*) as cnt FROM users GROUP BY role")
    role_counts = {r["role"]: r["cnt"] for r in cursor.fetchall()}

    # Compute live activity stats for each returned user
    users_with_activity = []
    for u in user_rows:
        u_role = u["role"]
        u_id = u["id"]
        activity = {}

        if u_role == "farmer":
            # 1. Total products listed
            cursor.execute("SELECT COUNT(*) as cnt FROM products WHERE farmer_id = ?", (u_id,))
            prod_cnt = cursor.fetchone()["cnt"]

            # 2. Total orders received
            cursor.execute("SELECT COUNT(*) as cnt, COALESCE(SUM(quantity), 0) as total_kg FROM orders WHERE farmer_id = ?", (u_id,))
            ord_row = cursor.fetchone()
            ord_cnt = ord_row["cnt"]
            total_kg = round(ord_row["total_kg"], 1)

            # 3. Total earnings from delivered/completed orders
            cursor.execute("""
                SELECT COALESCE(SUM(total_amount), 0) as earnings 
                FROM orders 
                WHERE farmer_id = ? AND status IN ('delivered', 'completed')
            """, (u_id,))
            earnings = round(cursor.fetchone()["earnings"], 2)

            activity = {
                "products_listed": prod_cnt,
                "orders_received": ord_cnt,
                "volume_sold_kg": total_kg,
                "total_earnings_inr": earnings,
                "summary": f"{prod_cnt} crops listed • {ord_cnt} orders (₹{earnings:,.0f} earned)"
            }

        elif u_role == "buyer":
            # 1. Orders placed
            cursor.execute("SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as total_spent FROM orders WHERE buyer_id = ?", (u_id,))
            buy_row = cursor.fetchone()
            ord_cnt = buy_row["cnt"]
            spent = round(buy_row["total_spent"], 2)

            # 2. Delivered orders
            cursor.execute("SELECT COUNT(*) as cnt FROM orders WHERE buyer_id = ? AND status IN ('delivered', 'completed')", (u_id,))
            deliv_cnt = cursor.fetchone()["cnt"]

            activity = {
                "orders_placed": ord_cnt,
                "orders_delivered": deliv_cnt,
                "total_spent_inr": spent,
                "summary": f"{ord_cnt} orders placed ({deliv_cnt} delivered) • ₹{spent:,.0f} spent"
            }

        elif u_role == "logistics":
            # Deliveries handled & active hubs
            cursor.execute("SELECT COUNT(*) as cnt FROM orders WHERE status IN ('delivered', 'completed')")
            deliv_cnt = cursor.fetchone()["cnt"]
            cursor.execute("SELECT COUNT(*) as cnt FROM orders WHERE status IN ('ordered', 'pickup_complete', 'shipped')")
            active_cnt = cursor.fetchone()["cnt"]
            cursor.execute("SELECT COUNT(*) as cnt FROM delivery_hubs")
            hubs_cnt = cursor.fetchone()["cnt"]

            activity = {
                "deliveries_completed": deliv_cnt,
                "active_shipments": active_cnt,
                "network_hubs": hubs_cnt,
                "summary": f"{hubs_cnt} network hubs • {active_cnt} active shipments • {deliv_cnt} fulfilled"
            }
        else: # admin
            activity = {
                "summary": "Full Ministry Administrative & Resolution Privileges"
            }

        u["activity"] = activity
        users_with_activity.append(u)

    conn.close()

    return jsonify({
        "success": True,
        "summary": {
            "total_users": sum(role_counts.values()),
            "total_farmers": role_counts.get("farmer", 0),
            "total_buyers": role_counts.get("buyer", 0),
            "total_logistics": role_counts.get("logistics", 0),
            "filtered_count": len(users_with_activity)
        },
        "users": users_with_activity
    })
