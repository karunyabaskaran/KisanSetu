"""
KisanSetu - Support & Dispute Resolution Module
Allows Farmers & Buyers to file grievances against Logistics/Consumers/Farmers with file attachments and expected resolutions.
Disputes are escalated directly to the Ministry Admin for investigation and recorded resolution.
"""

import os
import uuid
import datetime
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from backend.db import get_db

support_bp = Blueprint("support", __name__)

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "uploads")
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "pdf", "txt", "webp"}

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

@support_bp.route("/file-upload", methods=["POST"])
def file_upload():
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file part"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"success": False, "message": "No selected file"}), 400

    if file and allowed_file(file.filename):
        filename = f"{uuid.uuid4().hex[:8]}_{secure_filename(file.filename)}"
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        return jsonify({
            "success": True, 
            "url": f"/static/uploads/{filename}",
            "filename": filename
        })
    return jsonify({"success": False, "message": "Invalid file type. Allowed: PNG, JPG, PDF, TXT"}), 400

@support_bp.route("/raise", methods=["POST"])
def raise_ticket():
    data = request.get_json() or {}
    user_id = data.get("user_id")
    role = data.get("role", "farmer").lower()
    target_entity = data.get("target_entity", "logistics").lower() # 'consumer', 'logistics', 'farmer'
    subject = data.get("subject", "").strip()
    description = data.get("description", "").strip()
    expected_resolution = data.get("expected_resolution", "").strip()
    attachment_url = data.get("attachment_url", "").strip()

    if not user_id or not subject or not description or not expected_resolution:
        return jsonify({"success": False, "message": "All fields including expected resolution are mandatory."}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return jsonify({"success": False, "message": "User not found."}), 404

    ticket_number = f"TKT-AGRI-{uuid.uuid4().hex[:6].upper()}"

    try:
        cursor.execute("""
            INSERT INTO support_tickets (
                ticket_number, raised_by_id, raised_by_name, raised_by_role,
                target_entity, subject, description, expected_resolution, attachment_url, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Review')
        """, (
            ticket_number, user_id, user["name"], role,
            target_entity, subject, description, expected_resolution, attachment_url
        ))
        conn.commit()
        conn.close()

        return jsonify({
            "success": True,
            "message": f"Grievance filed under reference #{ticket_number}. Forwarded to Ministry Oversight Desk.",
            "ticket_number": ticket_number
        })
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)}), 500

@support_bp.route("/list", methods=["GET"])
def list_tickets():
    user_id = request.args.get("user_id")
    is_admin = request.args.get("is_admin", "false").lower() == "true"

    conn = get_db()
    cursor = conn.cursor()

    if is_admin:
        cursor.execute("SELECT * FROM support_tickets ORDER BY id DESC")
    else:
        cursor.execute("SELECT * FROM support_tickets WHERE raised_by_id = ? ORDER BY id DESC", (user_id,))

    rows = cursor.fetchall()
    conn.close()

    tickets = [dict(r) for r in rows]
    return jsonify({
        "success": True,
        "count": len(tickets),
        "tickets": tickets
    })

@support_bp.route("/resolve", methods=["POST"])
def resolve_ticket():
    """
    Ministry Admin resolves grievance with official verdict notes.
    """
    data = request.get_json() or {}
    ticket_id = data.get("ticket_id")
    admin_notes = data.get("admin_resolution_notes", "").strip()
    status = data.get("status", "Resolved")

    if not ticket_id or not admin_notes:
        return jsonify({"success": False, "message": "Ticket ID and Ministry resolution notes are required."}), 400

    conn = get_db()
    cursor = conn.cursor()

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("""
        UPDATE support_tickets
        SET status = ?,
            admin_resolution_notes = ?,
            resolved_at = ?
        WHERE id = ?
    """, (status, admin_notes, now_str, ticket_id))

    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "message": f"Grievance #{ticket_id} updated with Ministry resolution.",
        "resolved_at": now_str
    })
