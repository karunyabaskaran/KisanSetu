"""
KisanSetu - Database Layer
Provides SQLite persistent storage with schema management, seed data,
and an extensible adapter for Firebase Firestore / Realtime DB.
"""

import sqlite3
import json
import os
import datetime
from pathlib import Path

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "kisansetu.db")
FIREBASE_CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "firebase_config.json")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # 1. Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        mobile TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL, -- 'farmer', 'buyer', 'logistics', 'admin'
        state TEXT,
        district TEXT,
        village TEXT,
        pincode TEXT,
        latitude REAL,
        longitude REAL,
        password TEXT NOT NULL,
        status TEXT DEFAULT 'approved', -- 'pending', 'approved', 'rejected'
        rejection_reason TEXT,
        approved_at TIMESTAMP,
        reviewed_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 2. Products Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        farmer_id INTEGER NOT NULL,
        farmer_name TEXT NOT NULL,
        farmer_mobile TEXT,
        farmer_state TEXT NOT NULL,
        farmer_district TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT DEFAULT 'Grains',
        variety TEXT NOT NULL,
        grade TEXT NOT NULL, -- Grade A, Grade B, Grade C, Export
        available_quantity REAL NOT NULL, -- in kg
        unit TEXT DEFAULT 'kg',
        image_url TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(farmer_id) REFERENCES users(id)
    )
    """)

    # 3. Slab Pricing Table (Tiered pricing per product)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS price_slabs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        min_quantity REAL NOT NULL, -- e.g., 0
        max_quantity REAL,          -- e.g., 10 (or NULL for no upper limit)
        price_per_kg REAL NOT NULL, -- e.g., 40.0
        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    )
    """)

    # 4. Orders Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT UNIQUE NOT NULL,
        product_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        farmer_id INTEGER NOT NULL,
        farmer_name TEXT NOT NULL,
        farmer_state TEXT,
        buyer_id INTEGER NOT NULL,
        buyer_name TEXT NOT NULL,
        buyer_mobile TEXT,
        delivery_location TEXT NOT NULL,
        quantity REAL NOT NULL,
        price_per_kg REAL NOT NULL,
        total_amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'ordered', 
        -- Status lifecycle: 'ordered' -> 'pickup_complete' -> 'shipped' -> 'delivered' -> 'completed' OR 'returned'
        delivered_at TIMESTAMP,
        return_requested_at TIMESTAMP,
        return_reason TEXT, -- 'wrong_item' or 'damaged_item'
        return_proof_url TEXT,
        return_status TEXT, -- 'requested', 'approved', 'rejected'
        tracking_info TEXT, -- JSON string with logistics checkpoints
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- Multi-Agent Assignment & Hub-to-Hub Logistics Routing
        assigned_agent_id INTEGER,
        assigned_agent_name TEXT,
        assigned_agent_mobile TEXT,
        accepted_at TIMESTAMP,
        origin_hub_id INTEGER,
        destination_hub_id INTEGER,
        current_hub_id INTEGER,
        transit_stage TEXT DEFAULT 'awaiting_pickup',
        FOREIGN KEY(product_id) REFERENCES products(id),
        FOREIGN KEY(farmer_id) REFERENCES users(id),
        FOREIGN KEY(buyer_id) REFERENCES users(id),
        FOREIGN KEY(assigned_agent_id) REFERENCES users(id),
        FOREIGN KEY(origin_hub_id) REFERENCES delivery_hubs(id),
        FOREIGN KEY(destination_hub_id) REFERENCES delivery_hubs(id)
    )
    """)

    # Dynamic schema migration for users table
    cursor.execute("PRAGMA table_info(users)")
    user_cols = {row["name"] for row in cursor.fetchall()}
    if "address" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN address TEXT")
    if "status" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'approved'")
    if "rejection_reason" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN rejection_reason TEXT")
    if "approved_at" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN approved_at TIMESTAMP")
    if "reviewed_by" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN reviewed_by INTEGER")
    cursor.execute("UPDATE users SET status = 'approved' WHERE status IS NULL OR status = ''")

    # Dynamic schema migration for orders table
    cursor.execute("PRAGMA table_info(orders)")
    existing_cols = {row["name"] for row in cursor.fetchall()}
    order_migrations = [
        ("assigned_agent_id", "INTEGER"),
        ("assigned_agent_name", "TEXT"),
        ("assigned_agent_mobile", "TEXT"),
        ("accepted_at", "TIMESTAMP"),
        ("origin_hub_id", "INTEGER"),
        ("destination_hub_id", "INTEGER"),
        ("current_hub_id", "INTEGER"),
        ("transit_stage", "TEXT DEFAULT 'awaiting_pickup'"),
        ("batch_group_id", "TEXT"),
        ("product_cost", "REAL"),
        ("transport_cost", "REAL"),
        ("packaging_cost", "REAL"),
        ("tax_amount", "REAL"),
        ("payment_mode", "TEXT DEFAULT 'COD'"),
        ("payment_status", "TEXT DEFAULT 'pending_cod'"),
        ("transaction_id", "TEXT")
    ]
    for col_name, col_type in order_migrations:
        if col_name not in existing_cols:
            cursor.execute(f"ALTER TABLE orders ADD COLUMN {col_name} {col_type}")

    # 5. Support / Grievances Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS support_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_number TEXT UNIQUE NOT NULL,
        raised_by_id INTEGER NOT NULL,
        raised_by_name TEXT NOT NULL,
        raised_by_role TEXT NOT NULL,
        target_entity TEXT NOT NULL, -- 'consumer', 'logistics', 'farmer'
        subject TEXT NOT NULL,
        description TEXT NOT NULL,
        expected_resolution TEXT NOT NULL,
        attachment_url TEXT,
        status TEXT DEFAULT 'Pending Review', -- 'Pending Review', 'Under Ministry Investigation', 'Resolved'
        admin_resolution_notes TEXT,
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 6. Delivery Hubs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS delivery_hubs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hub_code TEXT UNIQUE NOT NULL,
        hub_name TEXT NOT NULL,
        incharge_name TEXT NOT NULL,
        contact_number TEXT NOT NULL,
        address TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        hub_type TEXT DEFAULT 'aggregation_depot', -- 'aggregation_depot', 'cold_storage', 'farm_gate_cluster'
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Seed delivery hubs if empty
    cursor.execute("SELECT COUNT(*) as cnt FROM delivery_hubs")
    hub_count = cursor.fetchone()["cnt"]
    if hub_count == 0:
        seed_hubs = [
            ("HUB-TN-01", "Madhavaram Central Agro Cold Storage Hub", "S. Rajendran", "9840112233", "GNT Road, Madhavaram, Chennai, Tamil Nadu 600060", 13.1488, 80.2306, "cold_storage"),
            ("HUB-TN-02", "Kanchipuram Paddy & Grain Aggregation Hub", "M. Velu", "9840223344", "Ennaikaran Street, Kanchipuram, Tamil Nadu 631501", 12.8342, 79.7036, "aggregation_depot"),
            ("HUB-TN-03", "Chengalpattu Vegetable Farm Gate Cluster", "R. Saravanan", "9840334455", "GST Road, Chengalpattu, Tamil Nadu 603001", 12.6841, 79.9836, "farm_gate_cluster"),
            ("HUB-TN-04", "Tiruvallur Organic Producer Hub", "P. Kumaresan", "9840445566", "JN Road, Tiruvallur, Tamil Nadu 602001", 13.1439, 79.9083, "aggregation_depot"),
            ("HUB-MH-01", "Vashi APMC Central Terminal Depot", "A. Shinde", "9820112233", "Sector 19, Vashi, Navi Mumbai, Maharashtra 400703", 19.0771, 73.0006, "aggregation_depot"),
            ("HUB-MH-02", "Nashik Ozar Onion Aggregation Yard", "K. Patil", "9820223344", "NH3, Ozar, Nashik, Maharashtra 422206", 20.0898, 73.9182, "aggregation_depot"),
            ("HUB-MH-03", "Pune Junnar Fresh Vegetable Hub", "D. Deshmukh", "9820334455", "Otur Road, Junnar, Pune, Maharashtra 410502", 19.2081, 73.8765, "cold_storage")
        ]
        cursor.executemany("""
            INSERT INTO delivery_hubs (hub_code, hub_name, incharge_name, contact_number, address, latitude, longitude, hub_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, seed_hubs)

    # Seed initial users & products if users table has few records
    seed_data(conn)

    conn.commit()
    conn.close()

def seed_data(conn):
    cursor = conn.cursor()
    now = datetime.datetime.now()

    cursor.execute("SELECT COUNT(*) as cnt FROM users")
    if cursor.fetchone()["cnt"] >= 6:
        return

    # --- Users ---
    sample_users = [
        # Farmer 1 - Tamil Nadu (Chennai region)
        ("Murugan Raman", "9840123456", "farmer", "Tamil Nadu", "Chennai", "Kovilambakkam", "Door No. 12, Delta Farm Road, Kovilambakkam", "600129", 12.9352, 80.1878, "farmer123"),
        # Farmer 2 - Maharashtra (Nashik)
        ("Dnyaneshwar Patil", "9822345678", "farmer", "Maharashtra", "Nashik", "Ozar", "Plot 45, Agro Park, Ozar", "422206", 20.0898, 73.9182, "farmer123"),
        # Farmer 3 - Punjab (Ludhiana)
        ("Gurpreet Singh", "9814567890", "farmer", "Punjab", "Ludhiana", "Sahnewal", "Farm House 8, GT Road, Sahnewal", "141120", 30.8490, 75.9818, "farmer123"),
        # Farmer 4 - Karnataka (Mysuru)
        ("Basavaraj Gowda", "9845678901", "farmer", "Karnataka", "Mysuru", "Nanjangud", "Kapila Riverside Farm, Nanjangud", "571301", 12.1200, 76.6800, "farmer123"),
        # Buyer 1 - Tamil Nadu (Chennai)
        ("Anand Krishnan", "9884123456", "buyer", "Tamil Nadu", "Chennai", "Adyar", "Flat 4B, Emerald Apts, 2nd Main Rd, Gandhi Nagar, Adyar", "600020", 13.0012, 80.2565, "buyer123"),
        # Buyer 2 - Bulk buyer from Maharashtra (Mumbai)
        ("Reliance Fresh Wholesale (Rajesh)", "9820123456", "buyer", "Maharashtra", "Mumbai", "Andheri", "Warehouse 5, MIDC Industrial Area, Andheri East", "400053", 19.1136, 72.8697, "buyer123"),
        # Logistics Provider
        ("Gramin Express Logistics", "9811122233", "logistics", "Delhi", "New Delhi", "Connaught Place", "Office 102, Regal Building, Connaught Place", "110001", 28.6304, 77.2177, "logistics123"),
        # Admin / Ministry
        ("Ministry of Agriculture & Farmers Welfare", "9999999999", "admin", "Delhi", "New Delhi", "Krishi Bhawan", "Room 210, Krishi Bhawan, Dr. Rajendra Prasad Road", "110001", 28.6190, 77.2135, "admin123"),
    ]

    for u in sample_users:
        cursor.execute("""
            INSERT OR IGNORE INTO users (name, mobile, role, state, district, village, address, pincode, latitude, longitude, password)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, u)

    # Note: Dummy marketplace products have been completely removed as per requirement.
    # Only registered farmers can add authentic products to the marketplace.
    conn.commit()

# Optional Firebase Adapter Helper
def get_firebase_status():
    try:
        from backend.firebase_db import get_firebase_status as fb_status
        return fb_status()
    except Exception as e:
        return {"configured": False, "error": str(e), "active_engine": "SQLite"}
