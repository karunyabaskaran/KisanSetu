"""
KisanSetu - Firestore Sync Utility
Run this script to immediately export your local SQLite database (users, products, orders, hubs)
into your Google Cloud Firestore database.
"""
import json
from backend.firebase_db import get_firebase_status, sync_sqlite_to_firestore

if __name__ == "__main__":
    print("=" * 60)
    print(" KisanSetu - Google Cloud Firestore Sync Utility")
    print("=" * 60)
    
    status = get_firebase_status()
    print("Current Engine Status:")
    print(json.dumps(status, indent=2))
    
    if not status.get("configured"):
        print("\n[!] Firebase credentials not detected.")
        print("To connect:")
        print("1. Place your 'firebase_credentials.json' service account file in the project root, OR")
        print("2. Set the 'FIREBASE_CREDENTIALS' environment variable with the JSON string.")
    else:
        print("\n[+] Firebase connected! Starting synchronization from SQLite to Cloud Firestore...")
        res = sync_sqlite_to_firestore()
        print("\nSync Results:")
        print(json.dumps(res, indent=2))
