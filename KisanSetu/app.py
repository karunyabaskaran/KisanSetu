"""
KisanSetu - Direct Farmer-to-Consumer & Bulk Buyer Platform
Flask Application Server
"""

import os
from flask import Flask, send_from_directory, jsonify
from flask_cors import CORS

from backend.db import init_db, get_firebase_status
from backend.auth import auth_bp
from backend.products import products_bp
from backend.orders import orders_bp
from backend.support import support_bp
from backend.ai_engine import ai_bp
from backend.logistics_engine import logistics_bp
from backend.admin import admin_bp

app = Flask(__name__, static_folder="frontend", static_url_path="")
CORS(app)

# Ensure static directories exist
os.makedirs(os.path.join(os.path.dirname(__file__), "static", "uploads"), exist_ok=True)

# Register Blueprints
app.register_blueprint(auth_bp, url_prefix="/api/auth")
app.register_blueprint(products_bp, url_prefix="/api/products")
app.register_blueprint(orders_bp, url_prefix="/api/orders")
app.register_blueprint(support_bp, url_prefix="/api/support")
app.register_blueprint(ai_bp, url_prefix="/api/ai")
app.register_blueprint(logistics_bp, url_prefix="/api/logistics")
app.register_blueprint(admin_bp, url_prefix="/api/admin")

# Serve Frontend Pages
@app.route("/")
def index():
    return send_from_directory("frontend", "index.html")

@app.route("/static/uploads/<path:filename>")
def serve_uploads(filename):
    uploads_dir = os.path.join(os.path.dirname(__file__), "static", "uploads")
    return send_from_directory(uploads_dir, filename)

@app.route("/api/system-status")
def system_status():
    fb_status = get_firebase_status()
    return jsonify({
        "status": "online",
        "platform": "KisanSetu Agricultural Exchange",
        "version": "2.0.0",
        "firebase": fb_status,
        "database": "Firestore (Active)" if fb_status.get("configured") else "SQLite (Active Fallback)",
        "ai_forecast": "Active",
        "logistics_hook": "backend/logistics_engine.py ready"
    })

@app.route("/api/firebase/status", methods=["GET"])
def firebase_status_route():
    from backend.firebase_db import get_firebase_status
    return jsonify(get_firebase_status())

@app.route("/api/firebase/sync", methods=["POST"])
def firebase_sync_route():
    from backend.firebase_db import sync_sqlite_to_firestore
    result = sync_sqlite_to_firestore()
    return jsonify(result), 200 if result.get("success") else 400

# Initialize Database and Firebase upon application load
init_db()
try:
    from backend.firebase_db import init_firebase
    init_firebase()
except Exception as _e:
    pass

if __name__ == "__main__":
    print("\n=======================================================")
    print(" [KisanSetu] - Direct Farm-to-Consumer Marketplace ")
    print(" Server running on: http://127.0.0.1:5000")
    print("=======================================================\n")
    app.run(host="0.0.0.0", port=5000, debug=False)
