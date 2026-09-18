"""
KisanSetu - Authentication & User Management Module
Supports Farmer (GPS + Village + District), Buyer (with OTP), Logistics, and Ministry Admin.
"""

import random
from flask import Blueprint, request, jsonify
from backend.db import get_db
from backend.sms_service import send_otp_sms

auth_bp = Blueprint("auth", __name__)

# In-memory OTP cache for verification
OTP_STORE = {}

@auth_bp.route("/send-otp", methods=["POST"])
def send_otp():
    """Generates an OTP for Buyer / Farmer mobile verification and dispatches real SMS"""
    data = request.get_json() or {}
    mobile = str(data.get("mobile", "")).strip()
    role = (data.get("role") or "user").strip().lower()
    if not mobile or len(mobile) < 10:
        return jsonify({"success": False, "message": "Please provide a valid 10-digit mobile number"}), 400

    otp = str(random.randint(100000, 999999))
    OTP_STORE[str(mobile)] = otp
    OTP_STORE[f"verified_{mobile}"] = False

    # Dispatch via SMS gateway (Twilio / Fast2SMS / Console fallback)
    sms_res = send_otp_sms(str(mobile), otp, role=role)

    role_label = "Farmer" if role == "farmer" else ("Consumer" if role == "buyer" else "")
    disp_role = f" ({role_label})" if role_label else ""

    return jsonify({
        "success": True,
        "otp": otp,
        "test_otp": otp,
        "message": f"{disp_role} OTP is: {otp} (Dispatched for +91-{mobile}).".strip(),
        "sms_provider": sms_res.get("provider", "console")
    })

@auth_bp.route("/verify-otp", methods=["POST"])
def verify_otp():
    """Verifies buyer / farmer entered OTP"""
    data = request.get_json() or {}
    mobile = str(data.get("mobile", "")).strip()
    entered_otp = str(data.get("otp", "")).strip()

    stored_otp = OTP_STORE.get(mobile)
    if stored_otp and stored_otp == entered_otp:
        OTP_STORE[f"verified_{mobile}"] = True
        return jsonify({"success": True, "message": "Mobile number verified successfully! You can now proceed."})
    return jsonify({"success": False, "message": "Invalid or expired OTP. Please check your SMS and try again."}), 400

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
    address = data.get("address", "").strip()
    village = data.get("village", "").strip()
    pincode = data.get("pincode", "").strip()
    latitude = data.get("latitude")
    longitude = data.get("longitude")

    if role == "admin":
        return jsonify({
            "success": False,
            "message": "Admin registration through portal is disabled. Ministry administrator credentials must be provisioned directly in the database."
        }), 403

    if not name or not mobile or not password:
        return jsonify({"success": False, "message": "Name, mobile, and password are required"}), 400

    if not state or not district or not address:
        return jsonify({"success": False, "message": "State, district, and complete address are required for all portals."}), 400

    if password != confirm_password:
        return jsonify({"success": False, "message": "Passwords do not match"}), 400

    # Enforce OTP verification for both farmer and buyer
    entered_otp = str(data.get("otp", "")).strip()
    is_verified = OTP_STORE.get(f"verified_{mobile}") or (OTP_STORE.get(mobile) and OTP_STORE.get(mobile) == entered_otp)
    if role in ["farmer", "buyer"] and not is_verified:
        return jsonify({
            "success": False,
            "message": f"Mobile OTP verification required. Please click 'Get OTP' and enter the 6-digit code received on your mobile."
        }), 400

    conn = get_db()
    cursor = conn.cursor()

    # Check if mobile exists
    cursor.execute("SELECT id FROM users WHERE mobile = ?", (mobile,))
    if cursor.fetchone():
        conn.close()
        return jsonify({"success": False, "message": f"An account with mobile {mobile} already exists."}), 400

    # Clear OTP state after successful validation
    OTP_STORE.pop(mobile, None)
    OTP_STORE.pop(f"verified_{mobile}", None)

    try:
        status = "pending" if role == "farmer" else "approved"
        cursor.execute("""
            INSERT INTO users (name, mobile, role, state, district, village, address, pincode, latitude, longitude, password, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (name, mobile, role, state, district, village, address, pincode, latitude, longitude, password, status))
        conn.commit()
        user_id = cursor.lastrowid

        cursor.execute("SELECT id, name, mobile, role, state, district, village, address, pincode, latitude, longitude, status, created_at FROM users WHERE id = ?", (user_id,))
        user_row = dict(cursor.fetchone())
        conn.close()

        if role == "farmer":
            return jsonify({
                "success": True,
                "status": "pending",
                "message": f"Registration application submitted successfully! Your account is pending Ministry Admin review and approval. You can sign in once approved.",
                "user": user_row
            })

        return jsonify({
            "success": True,
            "status": "approved",
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

    user_status = user_dict.get("status") or "approved"
    if user_dict.get("role") == "farmer":
        if user_status == "pending":
            return jsonify({
                "success": False,
                "status": "pending",
                "message": "Your farmer registration is currently pending Ministry approval. Please wait for an administrator to review and approve your application."
            }), 403
        elif user_status == "rejected":
            reason = user_dict.get("rejection_reason") or "Application criteria not met"
            return jsonify({
                "success": False,
                "status": "rejected",
                "message": f"Your registration application was rejected by the Administrator. Reason: {reason}."
            }), 403

    return jsonify({
        "success": True,
        "message": f"Welcome back, {user_dict['name']}!",
        "user": user_dict
    })

@auth_bp.route("/login-otp", methods=["POST"])
def login_otp():
    """Authenticates a user via verified OTP code."""
    data = request.get_json() or {}
    mobile = str(data.get("mobile", "")).strip()
    entered_otp = str(data.get("otp", "")).strip()
    role = str(data.get("role", "")).strip().lower()

    if not mobile or not entered_otp:
        return jsonify({"success": False, "message": "Mobile number and OTP code are required"}), 400

    stored_otp = OTP_STORE.get(mobile)
    is_verified = OTP_STORE.get(f"verified_{mobile}") or (stored_otp and stored_otp == entered_otp)
    if not is_verified:
        return jsonify({"success": False, "message": "Invalid or expired OTP. Please click 'Get OTP' to receive a new code."}), 400

    conn = get_db()
    cursor = conn.cursor()

    query = "SELECT * FROM users WHERE mobile = ?"
    params = [mobile]
    if role:
        query += " AND role = ?"
        params.append(role)

    cursor.execute(query, params)
    user = cursor.fetchone()
    conn.close()

    if not user:
        role_name = role.capitalize() if role else "User"
        return jsonify({
            "success": False,
            "message": f"No {role_name} account found with mobile {mobile}. Please click 'Register here' to create your account."
        }), 404

    user_dict = dict(user)
    if "password" in user_dict:
        del user_dict["password"]

    user_status = user_dict.get("status") or "approved"
    if user_dict.get("role") == "farmer":
        if user_status == "pending":
            return jsonify({
                "success": False,
                "status": "pending",
                "message": "Your farmer registration is currently pending Ministry approval. Please wait for an administrator to review and approve your application."
            }), 403
        elif user_status == "rejected":
            reason = user_dict.get("rejection_reason") or "Application criteria not met"
            return jsonify({
                "success": False,
                "status": "rejected",
                "message": f"Your registration application was rejected by the Administrator. Reason: {reason}."
            }), 403

    # Clear OTP state after successful login
    OTP_STORE.pop(mobile, None)
    OTP_STORE.pop(f"verified_{mobile}", None)

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
        cursor.execute("SELECT id, name, mobile, role, state, district, village, address, pincode, latitude, longitude FROM users WHERE id = ?", (user_id,))
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
    address = data.get("address")
    pincode = data.get("pincode")

    cursor.execute("""
        UPDATE users 
        SET name = COALESCE(?, name),
            state = COALESCE(?, state),
            district = COALESCE(?, district),
            village = COALESCE(?, village),
            address = COALESCE(?, address),
            pincode = COALESCE(?, pincode)
        WHERE id = ?
    """, (name, state, district, village, address, pincode, user_id))
    conn.commit()

    cursor.execute("SELECT id, name, mobile, role, state, district, village, address, pincode, latitude, longitude FROM users WHERE id = ?", (user_id,))
    updated_user = cursor.fetchone()
    conn.close()

    return jsonify({"success": True, "message": "Profile updated successfully", "user": dict(updated_user)})
