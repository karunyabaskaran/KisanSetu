"""
KisanSetu - Firebase Firestore Integration Adapter
Supports:
1. Direct credential loading via `FIREBASE_CREDENTIALS` environment variable (Render best practice).
2. Credential loading via local `firebase_credentials.json` file.
3. Bidirectional sync utilities between local storage and Google Cloud Firestore.
4. Graceful fallback when Firebase credentials are not yet supplied.
"""

import os
import json
import logging
from typing import Optional, Dict, Any, List
import sqlite3

logger = logging.getLogger("kisansetu.firebase")

# Firebase SDK imports
_firebase_initialized = False
_firestore_db = None
_firebase_project_id = None
_init_error = None

def init_firebase() -> bool:
    """
    Initializes the Firebase Admin SDK using either:
    1. `FIREBASE_CREDENTIALS` environment variable containing service account JSON string.
    2. `GOOGLE_APPLICATION_CREDENTIALS` environment variable with path to JSON.
    3. `firebase_credentials.json` or `firebase_config.json` in project root.
    """
    global _firebase_initialized, _firestore_db, _firebase_project_id, _init_error

    if _firebase_initialized:
        return True

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        cred = None
        source = None

        # 1. Check environment variable FIREBASE_CREDENTIALS (Render recommended)
        env_cred = os.environ.get("FIREBASE_CREDENTIALS")
        if env_cred and env_cred.strip():
            try:
                cred_dict = json.loads(env_cred)
                cred = credentials.Certificate(cred_dict)
                _firebase_project_id = cred_dict.get("project_id")
                source = "environment_variable:FIREBASE_CREDENTIALS"
            except Exception as ex:
                logger.error(f"Failed to parse FIREBASE_CREDENTIALS env var JSON: {ex}")
                _init_error = f"Invalid FIREBASE_CREDENTIALS JSON: {ex}"

        # 2. Check GOOGLE_APPLICATION_CREDENTIALS env var
        if not cred and os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
            path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
            if os.path.exists(path):
                cred = credentials.Certificate(path)
                source = f"env_path:{path}"

        # 3. Check local root json files
        if not cred:
            project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            candidates = [
                os.path.join(project_root, "firebase_credentials.json"),
                os.path.join(project_root, "firebase_config.json")
            ]
            for candidate in candidates:
                if os.path.exists(candidate):
                    try:
                        with open(candidate, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            # Check if it has service account fields or web config
                            if "project_id" in data and "private_key" in data:
                                cred = credentials.Certificate(data)
                                _firebase_project_id = data.get("project_id")
                                source = f"file:{os.path.basename(candidate)}"
                                break
                            elif "projectId" in data:
                                _firebase_project_id = data.get("projectId")
                    except Exception as e:
                        logger.warning(f"Error reading {candidate}: {e}")

        if cred:
            # Initialize default app if not already initialized
            if not firebase_admin._apps:
                firebase_admin.initialize_app(cred)
            _firestore_db = firestore.client()
            _firebase_initialized = True
            _init_error = None
            logger.info(f"Firebase Admin SDK initialized successfully via {source} (Project: {_firebase_project_id})")
            return True
        else:
            if not _init_error:
                _init_error = "No valid Firebase credentials provided. Running in local SQLite mode."
            return False

    except ImportError:
        _init_error = "firebase-admin package is not installed."
        logger.warning(_init_error)
        return False
    except Exception as ex:
        _init_error = str(ex)
        logger.error(f"Firebase initialization error: {ex}")
        return False

def get_firestore_client():
    """Returns the Firestore client if initialized, else None."""
    if not _firebase_initialized:
        init_firebase()
    return _firestore_db

def get_firebase_status() -> Dict[str, Any]:
    """Returns detailed status information about Firebase Firestore configuration."""
    if not _firebase_initialized:
        init_firebase()

    return {
        "configured": _firebase_initialized,
        "active_engine": "Google Cloud Firestore" if _firebase_initialized else "SQLite (Local Database)",
        "project_id": _firebase_project_id,
        "error": _init_error if not _firebase_initialized else None,
        "render_setup_hint": "Add 'FIREBASE_CREDENTIALS' in Render Dashboard Environment settings with your service account JSON."
    }

def save_document(collection: str, doc_id: str, data: Dict[str, Any]) -> bool:
    """Save or update a document in Firestore."""
    client = get_firestore_client()
    if not client:
        return False
    try:
        client.collection(collection).document(str(doc_id)).set(data, merge=True)
        return True
    except Exception as e:
        logger.error(f"Error saving document {collection}/{doc_id} to Firestore: {e}")
        return False

def get_document(collection: str, doc_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a single document from Firestore."""
    client = get_firestore_client()
    if not client:
        return None
    try:
        doc = client.collection(collection).document(str(doc_id)).get()
        if doc.exists:
            return doc.to_dict()
        return None
    except Exception as e:
        logger.error(f"Error fetching document {collection}/{doc_id} from Firestore: {e}")
        return None

def sync_sqlite_to_firestore(db_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Syncs existing SQLite records (users, products, delivery_hubs, orders, support_tickets)
    into Google Cloud Firestore collections.
    """
    client = get_firestore_client()
    if not client:
        return {
            "success": False,
            "error": "Firebase Firestore is not initialized or credentials missing.",
            "status": get_firebase_status()
        }

    if not db_path:
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        db_path = os.path.join(project_root, "kisansetu.db")

    if not os.path.exists(db_path):
        return {"success": False, "error": f"Database file {db_path} not found"}

    counts = {}
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 1. Sync Users
        cursor.execute("SELECT * FROM users")
        users = cursor.fetchall()
        for u in users:
            row_dict = dict(u)
            # Exclude raw password if desirable or mask it
            client.collection("users").document(str(row_dict["id"])).set(row_dict, merge=True)
        counts["users"] = len(users)

        # 2. Sync Products (with slabs)
        cursor.execute("SELECT * FROM products")
        products = cursor.fetchall()
        for p in products:
            row_dict = dict(p)
            cursor.execute("SELECT min_quantity, max_quantity, price_per_kg FROM price_slabs WHERE product_id = ?", (row_dict["id"],))
            slabs = [dict(s) for s in cursor.fetchall()]
            row_dict["price_slabs"] = slabs
            client.collection("products").document(str(row_dict["id"])).set(row_dict, merge=True)
        counts["products"] = len(products)

        # 3. Sync Delivery Hubs
        cursor.execute("SELECT * FROM delivery_hubs")
        hubs = cursor.fetchall()
        for h in hubs:
            row_dict = dict(h)
            client.collection("delivery_hubs").document(str(row_dict["id"])).set(row_dict, merge=True)
        counts["delivery_hubs"] = len(hubs)

        # 4. Sync Orders
        cursor.execute("SELECT * FROM orders")
        orders = cursor.fetchall()
        for o in orders:
            row_dict = dict(o)
            client.collection("orders").document(str(row_dict["id"])).set(row_dict, merge=True)
        counts["orders"] = len(orders)

        # 5. Sync Support Tickets
        cursor.execute("SELECT * FROM support_tickets")
        tickets = cursor.fetchall()
        for t in tickets:
            row_dict = dict(t)
            client.collection("support_tickets").document(str(row_dict["id"])).set(row_dict, merge=True)
        counts["support_tickets"] = len(tickets)

        conn.close()
        return {
            "success": True,
            "message": "Successfully synchronized local data with Google Cloud Firestore.",
            "synced_counts": counts
        }
    except Exception as e:
        logger.error(f"Error during SQLite to Firestore sync: {e}")
        return {"success": False, "error": str(e)}
