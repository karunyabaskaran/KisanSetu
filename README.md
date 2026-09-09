# 🌾 KisanSetu - Direct Farm-to-Consumer & Bulk Buyer Platform

> **Empowering Indian Agriculture:** Direct disintermediation connecting farmers and FPOs directly with retail consumers and bulk institutional buyers with volume-based slab pricing, 22-language auto-detection, interactive GPS mapping, 7-day inspection protection, and Ministry dispute resolution.

---

## 🌟 Key Architecture & Flow Implemented

### 1. Unified Authentication & 4 Distinct Roles
- **Farmer / FPO**:
  - Name, mobile, State, District (auto-fetched via GPS + interactive Leaflet map pin-drop), Village name, Pincode, Password.
- **Buyer (Retail & Bulk)**:
  - Name, mobile, OTP verification (simulated test OTP with interactive UI feedback), District, State, Pincode, Password.
- **Logistics Partner**:
  - Active freight and dispatch tracking interface.
- **Admin (Ministry of Agriculture)**:
  - Grievance resolution tribunal & AI market demand radar.

### 2. Farmer Portal
- **Pan-India Marketplace**: View produce from across all Indian states.
- **My Products (with Slab / Tier Pricing)**:
  - Add produce: Product name, variety, grade (Grade A, B, C, Export), available quantity (kg), description.
  - **Dynamic Slab Pricing Builder**: Farmer configures custom tiered volume rates (e.g., $< 10\text{ kg} \rightarrow ₹45/\text{kg}$, $10 - 50\text{ kg} \rightarrow ₹38/\text{kg}$, $> 50\text{ kg} \rightarrow ₹32/\text{kg}$).
- **Orders Management & Critical Status Styling**:
  - `Ordered` $\rightarrow$ `Pickup Complete` $\rightarrow$ `Shipped` $\rightarrow$ `Delivered`.
  - **Yellow Timer Badge**: Delivered status renders in **amber/yellow with a timer icon** indicating the active 7-day inspection window.
  - **Green Finalized Badge**: After 7 days, turns **emerald green** indicating verified delivery.
  - **Red Return Badge**: If the buyer files a return, displays in **bold red font**.
- **Support & Grievance Redressal**:
  - Raise complaints against consumer or logistics partner with attached file proof and expected resolution.
  - Tracks Ministry official resolution notes and actions taken.
- **22 Official Languages Localization**:
  - Auto-switches based on location fetched during login (e.g. Chennai/Tamil Nadu $\rightarrow$ Tamil, Maharashtra $\rightarrow$ Marathi, Punjab $\rightarrow$ Punjabi, etc.) plus manual selector for all 22 Eighth Schedule languages + English.

### 3. Buyer Portal
- **Location-Prioritized Marketplace**:
  - Produce prioritized first by buyer's home state, then neighboring states, then nationwide.
  - Search by crop name and input required quantity: **Dynamic Unit Price** instantly recalculates based on farmer's configured slabs.
- **Direct Farm Purchase**:
  - One-click direct order checkout specifying delivery location.
- **My Orders**:
  - Order ID, date, product name, farmer name, quantity, cost/kg, total cost, order status.
  - **Track My Order**: Visual step-by-step route timeline.
  - **7-Day Return Protection**: Active strictly within 7 days of delivery and accepted only for:
    1. *Wrong item delivered*
    2. *Damaged item delivered* (with proof photo attachment).

### 4. Logistics Engine Extension Points
- `backend/logistics_engine.py`: Dedicated Python module with distance calculation, freight estimation, and placeholder function `custom_route_optimization(origin, destination, waypoints)` where you can plug in custom routing algorithms.
- `frontend/js/logistics_hook.js`: Dedicated JavaScript hook with `LogisticsHook.renderCustomTrackingUI` and `calculateRoute` functions ready for your custom telemetry or map rendering.

### 5. Ministry of Agriculture Admin Portal & Governance
- **Farmer Registration Applications & Approval Desk**:
  - All new farmer registrations enter a `pending` state and cannot access the portal until approved.
  - The Admin Dashboard features an **urgent pending applications banner** and real-time pending counters.
  - Ministry officials review each applicant's credentials, address, village, and pinpoint GPS coordinates on Google Maps, and can **Approve** or **Reject** with official remarks.
  - Approved farmers can immediately log in; rejected applicants receive specific administrative remarks upon attempting to sign in.
- **Admin Authentication Security (No Self-Registration)**:
  - Public registration for the Admin (Ministry) role is completely disabled in the UI and API (`HTTP 403 Forbidden`).
  - Ministry administrator credentials must be manually provisioned directly in the database by developers.
- **Tribunal Grievance Resolution Desk**: Ministry officials inspect farmer and buyer complaints, review attached proofs, and record official resolutions.
- **AI Demand Forecasting Radar**: Powered by Scikit-learn Random Forest model predicting commodity demand indices and fair pricing baselines.

---

## 🛠️ Developer Guide: Provisioning Ministry Admin Credentials

Per security policies, administrator accounts cannot be self-registered through the public portal. When new administrator credentials are required, a developer must provision them directly in the database.

### Method 1: Using the Built-in CLI Tool (Recommended)

Run the CLI command from the repository root:

```bash
# Add a new Ministry Administrator
python -m backend.manage_admin add --name "Dr. P. Sharma" --mobile "9876543210" --password "SecureAdminPass123" --state "Delhi" --district "New Delhi"

# List all current Ministry Administrators
python -m backend.manage_admin list

# Run interactive provisioning wizard
python -m backend.manage_admin
```

### Method 2: Direct Database Insertion (SQLite)

```sql
INSERT INTO users (
    name, mobile, role, state, district, village, address, pincode, password, status
) VALUES (
    'Official Admin', '9876543210', 'admin', 'Delhi', 'New Delhi', 'Krishi Bhawan', 'Krishi Bhawan, Rajendra Prasad Road', '110001', 'SecureAdminPass123', 'approved'
);
```

## 🚀 How to Run Locally

### Prerequisites
- Python 3.10+ (Flask, flask-cors, scikit-learn, numpy)

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Start the Application
```bash
python app.py
```
Open your browser and navigate to:
```
http://127.0.0.1:5000
```

### 3. Test One-Click Demo Accounts
Use the quick-login bar at the top of the app to try any role:
- **Farmer**: Mobile `9840123456`, Password `farmer123` (Murugan Raman, Chennai, Tamil Nadu)
- **Buyer**: Mobile `9884123456`, Password `buyer123` (Anand Krishnan, Chennai, Tamil Nadu)
- **Logistics**: Mobile `9811122233`, Password `logistics123`
- **Admin**: Mobile `9999999999`, Password `admin123` (Ministry of Agriculture)

### 4. Run Automated End-to-End Tests
```bash
python test_flow.py
```
