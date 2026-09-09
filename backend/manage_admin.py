"""
KisanSetu - Ministry Admin Credentials Management Utility
For Developer & System Administrator Use Only.

Per security policies, Ministry Admin accounts cannot be self-registered through the public portal.
New Ministry / Administrator accounts must be manually provisioned directly in the database.

Usage:
  1. Interactive mode:
     python -m backend.manage_admin

  2. List all admins:
     python -m backend.manage_admin list

  3. Add new admin:
     python -m backend.manage_admin add --name "Krishi Officer" --mobile "9876543210" --password "adminpass" --state "Delhi" --district "New Delhi"
"""

import sys
import argparse

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from backend.db import get_db, init_db

def list_admins():
    init_db()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, name, mobile, role, state, district, village, address, pincode, status, created_at
        FROM users
        WHERE role = 'admin'
        ORDER BY id ASC
    """)
    admins = cursor.fetchall()
    conn.close()

    print("\n" + "=" * 70)
    print(f"  🏛️  KISANSETU REGISTERED MINISTRY ADMINISTRATORS ({len(admins)} Total)")
    print("=" * 70)
    if not admins:
        print("  No admin accounts found in the database.")
    else:
        for a in admins:
            print(f"  [ID #{a['id']}] {a['name']}")
            print(f"    Mobile   : {a['mobile']}")
            print(f"    State    : {a['state'] or 'National'} | District: {a['district'] or 'Central'}")
            print(f"    Address  : {a['address'] or 'N/A'}")
            print(f"    Status   : {a['status'] or 'approved'}")
            print(f"    Created  : {a['created_at']}")
            print("-" * 70)
    print()

def add_admin(name, mobile, password, state="Delhi", district="New Delhi", village="Krishi Bhawan", address="Krishi Bhawan, Dr. Rajendra Prasad Road", pincode="110001", latitude=28.6190, longitude=77.2135):
    name = (name or "").strip()
    mobile = (mobile or "").strip()
    password = (password or "").strip()

    if not name or not mobile or not password:
        print("❌ Error: Name, mobile (10 digits), and password are required.")
        return False

    if len(mobile) < 10:
        print("❌ Error: Mobile number must be at least 10 digits.")
        return False

    init_db()
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id, name, role FROM users WHERE mobile = ?", (mobile,))
    existing = cursor.fetchone()
    if existing:
        print(f"❌ Error: A user with mobile {mobile} already exists (ID #{existing['id']} - {existing['name']}, Role: {existing['role']}).")
        conn.close()
        return False

    try:
        cursor.execute("""
            INSERT INTO users (name, mobile, role, state, district, village, address, pincode, latitude, longitude, password, status)
            VALUES (?, ?, 'admin', ?, ?, ?, ?, ?, ?, ?, ?, 'approved')
        """, (name, mobile, state, district, village, address, pincode, latitude, longitude, password))
        conn.commit()
        admin_id = cursor.lastrowid
        conn.close()
        print(f"✅ Success: Ministry Admin '{name}' created successfully (ID #{admin_id}, Mobile: {mobile}).")
        return True
    except Exception as e:
        conn.close()
        print(f"❌ Database error: {e}")
        return False

def interactive_mode():
    print("\n" + "=" * 70)
    print("  🏛️  KisanSetu - Ministry Administrator Manual Provisioning Tool")
    print("=" * 70)
    print("  1. List current Ministry Admins")
    print("  2. Add new Ministry Admin account")
    print("  3. Exit")
    print("=" * 70)

    try:
        choice = input("Enter choice [1/2/3]: ").strip()
    except (KeyboardInterrupt, EOFError):
        print("\nExiting.")
        return

    if choice == "1":
        list_admins()
    elif choice == "2":
        print("\n--- Enter Ministry Admin Details ---")
        name = input("Admin / Ministry Official Full Name: ").strip()
        mobile = input("Mobile Number (used for Sign In): ").strip()
        password = input("Password: ").strip()
        state = input("State [Delhi]: ").strip() or "Delhi"
        district = input("District [New Delhi]: ").strip() or "New Delhi"
        address = input("Official Address [Krishi Bhawan]: ").strip() or "Krishi Bhawan, Dr. Rajendra Prasad Road"
        pincode = input("Pincode [110001]: ").strip() or "110001"

        if add_admin(name, mobile, password, state=state, district=district, address=address, pincode=pincode):
            list_admins()
    else:
        print("Goodbye.")

def main():
    parser = argparse.ArgumentParser(description="KisanSetu Ministry Admin Manual Provisioning Tool")
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    subparsers.add_parser("list", help="List all registered Ministry Admins")

    add_parser = subparsers.add_parser("add", help="Add a new Ministry Admin")
    add_parser.add_argument("--name", required=True, help="Full official name")
    add_parser.add_argument("--mobile", required=True, help="10-digit mobile number")
    add_parser.add_argument("--password", required=True, help="Login password")
    add_parser.add_argument("--state", default="Delhi", help="State (default: Delhi)")
    add_parser.add_argument("--district", default="New Delhi", help="District (default: New Delhi)")
    add_parser.add_argument("--address", default="Krishi Bhawan, Dr. Rajendra Prasad Road", help="Office Address")
    add_parser.add_argument("--pincode", default="110001", help="Pincode")

    args = parser.parse_args()

    if args.command == "list":
        list_admins()
    elif args.command == "add":
        add_admin(
            name=args.name,
            mobile=args.mobile,
            password=args.password,
            state=args.state,
            district=args.district,
            address=args.address,
            pincode=args.pincode
        )
    else:
        interactive_mode()

if __name__ == "__main__":
    main()
