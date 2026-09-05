"""
KisanSetu - Authentication & User Management Module
Supports Farmer (GPS + Village + District), Buyer (with OTP), Logistics, and Ministry Admin.
"""

import random
from flask import Blueprint, request, jsonify
from backend.db import get_db

auth_bp = Blueprint("auth", __name__)

# Temporary in-memory OTP cache for demo/testing (in production, use SMS Gateway like Fast2SMS/Twilio)
OTP_STORE = {}

@auth_bp.route("/send-otp", methods=["POST"])
def send_otp():
    """Generates an OTP for Buyer mobile verification"""
    data = request.get_json() or {}
    mobile = data.get("mobile")
    if not mobile or len(str(mobile)) < 10:
        return jsonify({"success": False, "message": "Please provide a valid 10-digit mobile number"}), 400

    otp = str(random.randint(100000, 999999))
    OTP_STORE[str(mobile)] = otp
    # For quick testing, we return the generated OTP in the response payload alongside simulating SMS dispatch
    return jsonify({
        "success": True,
        "message": f"OTP successfully dispatched to +91-{mobile}",
        "test_otp": otp
    })

@auth_bp.route("/verify-otp", methods=["POST"])
def verify_otp():
    """Verifies buyer entered OTP"""
    data = request.get_json() or {}
    mobile = str(data.get("mobile", ""))
    entered_otp = str(data.get("otp", ""))

    stored_otp = OTP_STORE.get(mobile)
    if stored_otp and stored_otp == entered_otp:
        return jsonify({"success": True, "message": "Mobile number verified successfully"})
    return jsonify({"success": False, "message": "Invalid or expired OTP. Please try again."}), 400

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    role = data.get("role", "farmer").lower()
    name = data.get("name", "").strip()
    mobile = data.get("mobile", "").strip()
    password = data.get("password", "")
    confirm_password = data.get("confirm_password", "")
    state = data.get("state", "").strip()
    district = data.get("district", "").strip()
    village = data.get("village", "").strip()
    pincode = data.get("pincode", "").strip()
    latitude = data.get("latitude")
    longitude = data.get("longitude")

    if not name or not mobile or not password:
        return jsonify({"success": False, "message": "Name, mobile, and password are required"}), 400

    if password != confirm_password:
        return jsonify({"success": False, "message": "Passwords do not match"}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Check if mobile exists
    cursor.execute("SELECT id FROM users WHERE mobile = ?", (mobile,))
    if cursor.fetchone():
        conn.close()
        return jsonify({"success": False, "message": f"An account with mobile {mobile} already exists."}), 400

    try:
        cursor.execute("""
            INSERT INTO users (name, mobile, role, state, district, village, pincode, latitude, longitude, password)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (name, mobile, role, state, district, village, pincode, latitude, longitude, password))
        conn.commit()
        user_id = cursor.lastrowid

        cursor.execute("SELECT id, name, mobile, role, state, district, village, pincode, latitude, longitude FROM users WHERE id = ?", (user_id,))
        user_row = dict(cursor.fetchone())
        conn.close()

        return jsonify({
            "success": True,
            "message": f"Welcome to KisanSetu, {name}! Registered successfully as {role.capitalize()}.",
            "user": user_row
        })
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 500

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    mobile = data.get("mobile", "").strip()
    password = data.get("password", "")
    role = data.get("role", "").lower().strip()

    if not mobile or not password:
        return jsonify({"success": False, "message": "Mobile number and password required"}), 400

    conn = get_db()
    cursor = conn.cursor()

    query = "SELECT * FROM users WHERE mobile = ? AND password = ?"
    params = [mobile, password]
    if role:
        query += " AND role = ?"
        params.append(role)

    cursor.execute(query, params)
    user = cursor.fetchone()
    conn.close()

    if not user:
        return jsonify({"success": False, "message": "Invalid mobile, password, or role selection."}), 401

    user_dict = dict(user)
    del user_dict["password"]

    return jsonify({
        "success": True,
        "message": f"Welcome back, {user_dict['name']}!",
        "user": user_dict
    })

@auth_bp.route("/profile", methods=["GET", "PUT"])
def profile():
    user_id = request.args.get("user_id") or (request.get_json() or {}).get("user_id")
    if not user_id:
        return jsonify({"success": False, "message": "User ID required"}), 400

    conn = get_db()
    cursor = conn.cursor()

    if request.method == "GET":
        cursor.execute("SELECT id, name, mobile, role, state, district, village, pincode, latitude, longitude FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        conn.close()
        if not user:
            return jsonify({"success": False, "message": "User not found"}), 404
        return jsonify({"success": True, "user": dict(user)})

    # PUT update profile
    data = request.get_json() or {}
    name = data.get("name")
    state = data.get("state")
    district = data.get("district")
    village = data.get("village")
    pincode = data.get("pincode")

    cursor.execute("""
        UPDATE users 
        SET name = COALESCE(?, name),
            state = COALESCE(?, state),
            district = COALESCE(?, district),
            village = COALESCE(?, village),
            pincode = COALESCE(?, pincode)
        WHERE id = ?
    """, (name, state, district, village, pincode, user_id))
    conn.commit()

    cursor.execute("SELECT id, name, mobile, role, state, district, village, pincode, latitude, longitude FROM users WHERE id = ?", (user_id,))
    updated_user = cursor.fetchone()
    conn.close()

    return jsonify({"success": True, "message": "Profile updated successfully", "user": dict(updated_user)})
