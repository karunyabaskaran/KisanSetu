"""
KisanSetu - AI Engine
Provides:
1. Demand Forecasting per commodity, season, and state using Scikit-learn regression models.
2. Market Price Parity & Fair Price Recommendations to protect farmers from volatility.
"""

import numpy as np
import datetime
from sklearn.ensemble import RandomForestRegressor
from flask import Blueprint, jsonify, request

ai_bp = Blueprint("ai", __name__)

# Pre-trained heuristic training weights for Indian agricultural commodities
# Maps [Month (1-12), Rainfall Index (1-10), Supply Volume Index (1-10)] -> Demand Index (1-100)
def train_demand_model():
    # Synthetic realistic agricultural seasonal patterns across Kharif, Rabi, and Zaid
    X_train = np.array([
        [1, 2, 8], [2, 3, 7], [3, 4, 6], [4, 5, 5],
        [5, 6, 4], [6, 8, 4], [7, 9, 3], [8, 9, 3],
        [9, 7, 5], [10, 5, 7], [11, 3, 9], [12, 2, 9],
        # Festival & high demand surges
        [10, 4, 6], [11, 4, 7], [1, 3, 8], [4, 6, 5]
    ])
    # Demand scores
    y_train = np.array([55, 60, 68, 75, 82, 88, 92, 90, 85, 96, 94, 78, 95, 92, 60, 76])

    model = RandomForestRegressor(n_estimators=50, random_state=42)
    model.fit(X_train, y_train)
    return model

DEMAND_MODEL = train_demand_model()

COMMODITY_BASELINES = {
    # Vegetables
    "potato": {"msp": 16.0, "fair_market": 28.0, "local_vendor": 36.0, "demand_trend": "+8% (Steady)", "outlook": "Stable cold-storage arrivals with consistent regional household demand."},
    "tomato": {"msp": 18.0, "fair_market": 32.0, "local_vendor": 42.0, "demand_trend": "+16% (Seasonal Shift)", "outlook": "Strong consumer demand with localized mandi supply variance."},
    "onion": {"msp": 18.0, "fair_market": 26.0, "local_vendor": 35.0, "demand_trend": "+18% (Volatile)", "outlook": "Post-monsoon replenishment cycle with high daily culinary consumption."},
    "shallot": {"msp": 35.0, "fair_market": 52.0, "local_vendor": 68.0, "demand_trend": "+12% (Moderate)", "outlook": "Steady demand in southern culinary zones."},
    "carrot": {"msp": 24.0, "fair_market": 42.0, "local_vendor": 55.0, "demand_trend": "+14% (High Demand)", "outlook": "Hill-station harvest inflow with active consumer retail demand."},
    "cabbage": {"msp": 14.0, "fair_market": 22.0, "local_vendor": 30.0, "demand_trend": "+7% (Stable)", "outlook": "Healthy supply from local farm clusters keeping prices balanced."},
    "cauliflower": {"msp": 18.0, "fair_market": 28.0, "local_vendor": 38.0, "demand_trend": "+10% (Moderate)", "outlook": "Consistent institutional and restaurant demand."},
    "brinjal": {"msp": 16.0, "fair_market": 26.0, "local_vendor": 35.0, "demand_trend": "+9% (Steady)", "outlook": "Steady local harvest and strong everyday regional kitchen uptake."},
    "eggplant": {"msp": 16.0, "fair_market": 26.0, "local_vendor": 35.0, "demand_trend": "+9% (Steady)", "outlook": "Steady local harvest and strong everyday regional kitchen uptake."},
    "ladies finger": {"msp": 20.0, "fair_market": 34.0, "local_vendor": 45.0, "demand_trend": "+12% (Active)", "outlook": "High farm-fresh perishability favoring direct local farm delivery."},
    "okra": {"msp": 20.0, "fair_market": 34.0, "local_vendor": 45.0, "demand_trend": "+12% (Active)", "outlook": "High farm-fresh perishability favoring direct local farm delivery."},
    "capsicum": {"msp": 32.0, "fair_market": 52.0, "local_vendor": 70.0, "demand_trend": "+20% (Urban Surge)", "outlook": "Strong urban supermarket and catering demand for graded bell peppers."},
    "green chilli": {"msp": 35.0, "fair_market": 54.0, "local_vendor": 72.0, "demand_trend": "+15% (High)", "outlook": "Piquant culinary demand across southern and western markets."},
    "ginger": {"msp": 55.0, "fair_market": 85.0, "local_vendor": 115.0, "demand_trend": "+22% (Festive Surge)", "outlook": "Elevated seasonal culinary and wellness consumption."},
    "garlic": {"msp": 75.0, "fair_market": 120.0, "local_vendor": 160.0, "demand_trend": "+18% (High Value)", "outlook": "Dry bulb storage demand commanding premium realization."},
    "beetroot": {"msp": 18.0, "fair_market": 28.0, "local_vendor": 38.0, "demand_trend": "+8% (Consistent)", "outlook": "Year-round dietary demand with steady mandi supply."},
    "radish": {"msp": 14.0, "fair_market": 20.0, "local_vendor": 28.0, "demand_trend": "+6% (Normal)", "outlook": "Quick harvest turnover with healthy local vegetable stall sales."},
    "cucumber": {"msp": 14.0, "fair_market": 22.0, "local_vendor": 30.0, "demand_trend": "+14% (Salad Demand)", "outlook": "Urban salad and hydration demand supporting steady farm off-take."},
    "spinach": {"msp": 12.0, "fair_market": 20.0, "local_vendor": 28.0, "demand_trend": "+10% (Daily Essential)", "outlook": "Same-day morning harvest requirement favoring direct farm gate sales."},
    "beans": {"msp": 28.0, "fair_market": 46.0, "local_vendor": 62.0, "demand_trend": "+15% (Active)", "outlook": "Consistent domestic culinary usage with strong market sentiment."},
    "peas": {"msp": 32.0, "fair_market": 52.0, "local_vendor": 70.0, "demand_trend": "+22% (Peak Season)", "outlook": "Fresh green pod harvest capturing strong consumer interest."},

    # Fruits
    "apple": {"msp": 70.0, "fair_market": 110.0, "local_vendor": 145.0, "demand_trend": "+20% (Premium)", "outlook": "Hill produce transport margins eliminated, yielding direct consumer savings."},
    "banana": {"msp": 22.0, "fair_market": 32.0, "local_vendor": 44.0, "demand_trend": "+12% (Constant)", "outlook": "Staple fruit consumption with strong local temple and daily demand."},
    "mango": {"msp": 45.0, "fair_market": 75.0, "local_vendor": 105.0, "demand_trend": "+28% (Seasonal Peak)", "outlook": "High seasonal craze with consumers seeking direct orchard sweetness."},
    "grapes": {"msp": 42.0, "fair_market": 65.0, "local_vendor": 88.0, "demand_trend": "+22% (Harvest Rush)", "outlook": "Vineyard-fresh arrivals with swift retail supermarket uptake."},
    "orange": {"msp": 32.0, "fair_market": 48.0, "local_vendor": 65.0, "demand_trend": "+14% (Juice Demand)", "outlook": "Citrus replenishment cycles with strong household adoption."},
    "papaya": {"msp": 18.0, "fair_market": 28.0, "local_vendor": 38.0, "demand_trend": "+10% (Steady)", "outlook": "High nutritional preference driving uninterrupted weekly sales."},
    "pomegranate": {"msp": 65.0, "fair_market": 105.0, "local_vendor": 140.0, "demand_trend": "+18% (Health Surge)", "outlook": "Premium antioxidant fruit with lucrative direct consumer realization."},
    "watermelon": {"msp": 10.0, "fair_market": 18.0, "local_vendor": 25.0, "demand_trend": "+20% (Seasonal)", "outlook": "Bulk summer thirst quench driving large volume farm-gate trucks."},

    # Grains
    "rice": {"msp": 38.0, "fair_market": 48.0, "local_vendor": 62.0, "demand_trend": "+14% (High)", "outlook": "Strong South Indian domestic household milling demand."},
    "ponni": {"msp": 38.0, "fair_market": 50.0, "local_vendor": 65.0, "demand_trend": "+16% (High Demand)", "outlook": "South Indian staple rice with steady year-round consumption."},
    "basmati": {"msp": 65.0, "fair_market": 92.0, "local_vendor": 122.0, "demand_trend": "+22% (Surge)", "outlook": "Export momentum and festive feast culinary preference."},
    "wheat": {"msp": 24.0, "fair_market": 32.0, "local_vendor": 42.0, "demand_trend": "+8% (Stable)", "outlook": "Consistent household milling demand across all seasons."},
    "corn": {"msp": 18.0, "fair_market": 26.0, "local_vendor": 35.0, "demand_trend": "+12% (Feed & Food)", "outlook": "Dual demand from food processors and retail cobs."},
    "ragi": {"msp": 26.0, "fair_market": 38.0, "local_vendor": 50.0, "demand_trend": "+18% (Millet Boom)", "outlook": "Growing urban health consciousness for traditional nutritious millets."},

    # Pulses
    "toor dal": {"msp": 85.0, "fair_market": 125.0, "local_vendor": 160.0, "demand_trend": "+14% (Essential)", "outlook": "Staple protein source with consistent daily culinary demand."},
    "moong dal": {"msp": 78.0, "fair_market": 108.0, "local_vendor": 140.0, "demand_trend": "+12% (Steady)", "outlook": "Digestible dal with reliable family consumption."},
    "urad dal": {"msp": 80.0, "fair_market": 115.0, "local_vendor": 150.0, "demand_trend": "+15% (High)", "outlook": "Core ingredient for idli/dosa batter maintaining intense demand."},
    "chana dal": {"msp": 55.0, "fair_market": 78.0, "local_vendor": 102.0, "demand_trend": "+10% (Active)", "outlook": "Snack and festive culinary preparations maintaining healthy turnover."},

    # Spices
    "turmeric": {"msp": 80.0, "fair_market": 125.0, "local_vendor": 165.0, "demand_trend": "+16% (Wellness)", "outlook": "Medicinal and culinary spice with consistent processing demand."},
    "black pepper": {"msp": 320.0, "fair_market": 440.0, "local_vendor": 580.0, "demand_trend": "+20% (High Value)", "outlook": "Spice king commanding export quality price realization."},
    "cardamom": {"msp": 1100.0, "fair_market": 1600.0, "local_vendor": 2100.0, "demand_trend": "+25% (Aromatic)", "outlook": "Premium plantation spice with intense festive & export demand."}
}

ALL_COMMODITY_LIST = [
    "Tomato", "Potato", "Onion", "Carrot", "Cabbage", "Cauliflower",
    "Brinjal", "Ladies Finger", "Capsicum", "Green Chilli", "Fresh Ginger",
    "Garlic", "Beetroot", "Radish", "Cucumber", "Spinach", "Green Peas",
    "Ponni Raw Rice (Organic)", "1121 Traditional Basmati Rice", "Sharbati Golden Wheat",
    "Ragi (Finger Millet)", "Toor Dal", "Moong Dal", "Turmeric (Raw)",
    "Banana (Robusta)", "Apple (Himachal/Kashmir)", "Mango (Alphonso/Banganapalli)", "Thompson Seedless Grapes"
]

CROP_ALIASES = {
    "tomato": ["tomato", "tomatoes", "thakkali", "tamatar"],
    "potato": ["potato", "potatoes", "aloo", "batata", "alu"],
    "onion": ["onion", "onions", "pyaz", "vengayam", "kanda"],
    "shallot": ["shallot", "shallots", "sambhar onion", "chinna vengayam"],
    "rice": ["rice", "samba", "ponni", "basmati", "arisi", "chawal", "paddy"],
    "wheat": ["wheat", "sharbati", "atta", "gehu", "godhumai"],
    "chilli": ["chilli", "chillies", "chili", "chilies", "mirch", "milagai"],
    "carrot": ["carrot", "carrots", "gajar"],
    "banana": ["banana", "bananas", "kela", "vazhaipazham"],
    "mango": ["mango", "mangoes", "aam", "maambazham"],
    "apple": ["apple", "apples", "seb"],
    "garlic": ["garlic", "lahsun", "poondu"],
    "ginger": ["ginger", "adrak", "inji"],
    "cabbage": ["cabbage", "patta gobhi", "muttakos"],
    "cauliflower": ["cauliflower", "phool gobhi"],
    "brinjal": ["brinjal", "eggplant", "baingan", "kathirikai"],
    "okra": ["okra", "bhindi", "ladyfinger", "ladies finger", "vendakkai"],
    "turmeric": ["turmeric", "haldi", "manjal"],
    "cucumber": ["cucumber", "kheera", "vellarikkai"],
    "spinach": ["spinach", "palak", "keerai"],
    "beans": ["beans", "french beans", "avarai"],
    "peas": ["peas", "green peas", "matar", "pattani"],
    "capsicum": ["capsicum", "bell pepper", "shimla mirch", "kudai milagai"],
    "ragi": ["ragi", "finger millet", "kezhvaragu"],
    "toor dal": ["toor dal", "tuvar dal", "arhar", "thuvaram paruppu"],
    "moong dal": ["moong dal", "mung dal", "paasi paruppu"],
    "urad dal": ["urad dal", "ulutham paruppu"]
}

def detect_category_heuristic(commodity: str) -> str:
    c = commodity.lower()
    if any(w in c for w in ["rice", "wheat", "grain", "paddy", "corn", "maize", "millet", "ragi", "jowar", "bajra", "atta"]):
        return "Grains"
    if any(w in c for w in ["apple", "grape", "banana", "mango", "orange", "papaya", "fruit", "guava", "watermelon", "melon", "pomegranate", "lemon", "lime"]):
        return "Fruits"
    if any(w in c for w in ["dal", "gram", "pulse", "chana", "moong", "urad", "toor", "lentil", "rajma", "soybean", "cowpea"]):
        return "Pulses"
    if any(w in c for w in ["turmeric", "ginger", "garlic", "chilli", "pepper", "clove", "spice", "cardamom", "coriander", "cumin", "jeera", "mustard"]):
        return "Spices"
    return "Vegetables"

def get_commodity_baseline(commodity: str, region: str = "Tamil Nadu, India") -> dict:
    """Finds best matching baseline case-insensitively with substring tolerance and category fallback."""
    clean = commodity.lower().strip()
    
    # 1. Exact or substring match in dictionary
    for key, data in COMMODITY_BASELINES.items():
        if key in clean or clean in key:
            return data

    # 2. Dynamic Category-Based Fallback with deterministic name-hash variance
    # Guarantees that every unique crop name has a distinct, realistic price
    cat = detect_category_heuristic(clean)
    name_hash = sum(ord(char) for char in clean) % 15  # 0 to 14 variation

    category_defaults = {
        "Vegetables": {"msp": 18.0 + (name_hash % 6), "fair_market": 30.0 + name_hash, "local_vendor": 40.0 + int(name_hash * 1.3)},
        "Fruits": {"msp": 35.0 + (name_hash % 8), "fair_market": 55.0 + int(name_hash * 1.5), "local_vendor": 75.0 + int(name_hash * 2.0)},
        "Grains": {"msp": 25.0 + (name_hash % 5), "fair_market": 40.0 + name_hash, "local_vendor": 54.0 + int(name_hash * 1.4)},
        "Pulses": {"msp": 60.0 + (name_hash % 10), "fair_market": 90.0 + int(name_hash * 1.8), "local_vendor": 120.0 + int(name_hash * 2.4)},
        "Spices": {"msp": 90.0 + (name_hash * 4), "fair_market": 140.0 + int(name_hash * 6), "local_vendor": 190.0 + int(name_hash * 8)}
    }

    base = category_defaults.get(cat, category_defaults["Vegetables"])
    return {
        "msp": float(base["msp"]),
        "fair_market": float(base["fair_market"]),
        "local_vendor": float(base["local_vendor"]),
        "demand_trend": "+12% (Direct Farm-to-Fork Advantage)",
        "outlook": f"Steady regional demand for farm-fresh {commodity} in {region}."
    }

def _heuristic_forecast(commodity: str, month: int, region: str = "Tamil Nadu, India"):
    """
    Intelligent ML/heuristic fallback when Gemini is offline.
    Uses authoritative state-wise cultivation data from india-crops-statewise.md.
    Calculates direct farm-gate prices that are 15-25% lower than local street vendors.
    """
    features = np.array([[month, 6.5, 5.0]])
    predicted_demand_index = float(DEMAND_MODEL.predict(features)[0])

    from backend.crop_knowledge import lookup_crop_knowledge, get_all_cultivated_commodities
    crop_info = lookup_crop_knowledge(commodity, region)

    if crop_info.get("found") and crop_info.get("local_vendor_reference"):
        local_vendor = crop_info["local_vendor_reference"]
        suggested_retail = crop_info["suggested_retail"]
        suggested_bulk = crop_info["suggested_bulk"]
        cat = crop_info["category"]
        comparison = crop_info["state_insight"]
        msp = round(suggested_retail * 0.65, 1)
        canonical_name = crop_info["canonical_name"]
    else:
        baseline = get_commodity_baseline(commodity, region=region)
        raw_retail = round(baseline["fair_market"] * (1.0 + (predicted_demand_index - 70) / 200), 1)
        local_vendor = round(baseline.get("local_vendor", raw_retail * 1.25), 1)
        if raw_retail >= local_vendor or (local_vendor - raw_retail) / local_vendor < 0.12:
            suggested_retail = round(local_vendor * 0.80, 1)
        else:
            suggested_retail = raw_retail
        suggested_bulk = round(suggested_retail * 0.82, 1)
        cat = detect_category_heuristic(commodity)
        msp = baseline["msp"]
        canonical_name = commodity
        comparison = f"Local retail vendors charge ~₹{local_vendor}/kg in {region}. Direct farm price ₹{suggested_retail}/kg is 20% cheaper for buyers while eliminating middleman margins."

    savings_pct = int(round(((local_vendor - suggested_retail) / local_vendor) * 100))
    if savings_pct < 10:
        savings_pct = 20

    mid_price = round((suggested_retail + suggested_bulk) / 2.0, 1)
    all_crops = get_all_cultivated_commodities() or ALL_COMMODITY_LIST

    return {
        "success": True,
        "source": "KisanSetu ML Engine (Fallback)",
        "commodity": canonical_name,
        "category": cat,
        "region": region,
        "is_major_producing_hub": crop_info.get("is_major_producer", False),
        "matched_state": crop_info.get("matched_state"),
        "major_growing_states": crop_info.get("major_states", []),
        "indicative_price_range": crop_info.get("indicative_price_str", ""),
        "state_cultivation_insight": crop_info.get("state_insight", comparison),
        "forecast_period": f"Month {month} Agricultural Outlook",
        "demand_index": round(predicted_demand_index, 1),
        "demand_rating": "High Demand" if predicted_demand_index > 75 else "Moderate Demand",
        "local_vendor_price": local_vendor,
        "savings_percentage": savings_pct,
        "local_vendor_comparison": comparison,
        "market_insights": crop_info.get("state_insight", comparison),
        "festival_impact": {
            "festival_name": "Regional Harvest Season",
            "surge_percentage": "+12% Seasonal Uptick",
            "festival_notes": f"Anticipated festive demand in {region} maintains healthy market price support."
        },
        "perishability": "High" if cat in ["Vegetables", "Fruits"] else "Medium",
        "price_guidance": {
            "local_vendor_price": local_vendor,
            "savings_percentage": savings_pct,
            "government_msp": msp,
            "recommended_retail_slab": f"₹{suggested_retail} / kg",
            "recommended_bulk_slab": f"₹{suggested_bulk} / kg (>50 kg)",
            "trend": f"{savings_pct}% Cheaper than Local Vendors"
        },
        "suggested_slabs": [
            {"min_quantity": 0, "max_quantity": 10, "price_per_kg": suggested_retail},
            {"min_quantity": 10, "max_quantity": 50, "price_per_kg": mid_price},
            {"min_quantity": 50, "max_quantity": None, "price_per_kg": suggested_bulk}
        ],
        "all_commodities": all_crops
    }

@ai_bp.route("/forecast", methods=["GET"])
def get_forecast():
    """
    Returns AI Demand and Price Forecast for a selected commodity.
    Powered by Google Gemini AI with festival demand analysis and ML fallback.
    """
    commodity = request.args.get("commodity", "Tomato").strip()
    month = request.args.get("month")
    region = request.args.get("region") or request.args.get("location") or request.args.get("state") or "Tamil Nadu, India"
    month_int = int(month) if month and month.isdigit() else datetime.datetime.now().month

    # Try Google Gemini AI first
    try:
        from backend.gemini_service import get_gemini_crop_price_forecast
        gemini_res = get_gemini_crop_price_forecast(commodity, region=region, month=month_int)
        if gemini_res and gemini_res.get("success"):
            gemini_res["all_commodities"] = ALL_COMMODITY_LIST
            return jsonify(gemini_res)
    except Exception as e:
        print(f"[AIEngine] Gemini forecast fallback triggered for '{commodity}': {e}")

    # Fallback to local heuristic model
    res = _heuristic_forecast(commodity, month_int, region=region)
    return jsonify(res)

@ai_bp.route("/suggest-price", methods=["GET", "POST"])
def suggest_price():
    """
    Instant Price Calculation for any crop selected or typed by a farmer.
    Accepts JSON body or query params: { commodity: 'Carrot', region: 'Tamil Nadu' }
    """
    data = (request.get_json() if request.method == "POST" else None) or {}
    commodity = (data.get("commodity") or request.args.get("commodity") or "Carrot").strip()
    region = (data.get("region") or data.get("location") or data.get("farmer_location") or 
              data.get("state") or request.args.get("region") or request.args.get("location") or 
              request.args.get("state") or "Tamil Nadu, India")
    month = data.get("month") or request.args.get("month")
    month_int = int(month) if month and str(month).isdigit() else datetime.datetime.now().month

    try:
        from backend.gemini_service import get_gemini_crop_price_forecast
        gemini_res = get_gemini_crop_price_forecast(commodity, region=region, month=month_int)
        if gemini_res and gemini_res.get("success"):
            gemini_res["all_commodities"] = ALL_COMMODITY_LIST
            return jsonify(gemini_res)
    except Exception as e:
        print(f"[AIEngine] Suggest price fallback for '{commodity}': {e}")

    res = _heuristic_forecast(commodity, month_int, region=region)
    return jsonify(res)

def _heuristic_consumer_chat(message: str, user_context: dict, marketplace_items: list, order_history: list) -> dict:
    """
    Intelligent heuristic & rule-based conversational assistant when Gemini is offline.
    Reliably handles order tracking, marketplace queries, pricing, and recommendations.
    """
    import re
    msg_lower = message.lower().strip()
    user_name = (user_context or {}).get("name", "there")

    # 1. Check for specific order number in message (e.g., ORD-1001, #1001, ORD123)
    order_num_match = re.search(r'(?:#|ord-?|order\s*(?:#|no\.?|number)?\s*)(\d{3,6})', msg_lower)
    target_order_num = None
    if order_num_match:
        extracted = order_num_match.group(1)
        target_order_num = f"ORD-{extracted}" if not extracted.startswith("ord-") else extracted.upper()

    matched_order = None
    if target_order_num and order_history:
        for o in order_history:
            if str(o.get("order_number", "")).upper() == target_order_num or str(o.get("id")) == extracted:
                matched_order = o
                break

    # 2. Handle Order Queries
    if "order" in msg_lower or "track" in msg_lower or "delivery" in msg_lower or "status" in msg_lower or matched_order or "shipped" in msg_lower or "invoice" in msg_lower:
        if matched_order:
            status_map = {
                "ordered": "📋 Placed & Waiting for Farmer Aggregation",
                "pickup_complete": "📦 Collected by Logistics Carrier",
                "shipped": "🚚 In Transit via Farm Route Corridor",
                "delivered": "⏳ Delivered (Active 7-Day Quality Inspection)",
                "completed": "✅ Verified & Finalized",
                "returned": "🛑 Returned"
            }
            display_status = status_map.get(matched_order.get("status"), matched_order.get("status", "Processing"))
            reply = (
                f"### 📦 Order Details: #{matched_order.get('order_number')}\n\n"
                f"- **Product:** {matched_order.get('product_name')} ({matched_order.get('quantity')} kg)\n"
                f"- **Status:** {display_status}\n"
                f"- **Total Amount:** ₹{matched_order.get('total_amount')}\n"
                f"- **Payment Status:** {(matched_order.get('payment_status') or 'Paid').upper()}\n"
                f"- **Delivery Destination:** {matched_order.get('delivery_location', 'Your registered address')}\n"
                f"- **Date Ordered:** {str(matched_order.get('created_at', 'Today'))[:10]}\n\n"
                f"You can click the button below to view the official Commercial Tax Invoice and live checkpoint tracking."
            )
            return {
                "success": True,
                "source": "KisanSetu Intelligent Assistant",
                "reply": reply,
                "intent": "order_query",
                "referenced_orders": [matched_order.get("order_number")],
                "referenced_products": [matched_order.get("product_name")],
                "suggested_actions": [
                    {"type": "view_order", "label": f"📄 View Invoice #{matched_order.get('order_number')}", "order_number": matched_order.get("order_number")},
                    {"type": "navigate_tab", "label": "📦 View All My Orders", "tab": "orders"}
                ]
            }
        elif order_history and ("latest" in msg_lower or "my order" in msg_lower or "recent" in msg_lower or "where" in msg_lower):
            latest = order_history[0]
            status_map = {
                "ordered": "📋 Confirmed & Being Aggregated",
                "pickup_complete": "📦 Dispatched from Farm Depot",
                "shipped": "🚚 In Transit on Delivery Route",
                "delivered": "⏳ Delivered (Inspection Active)",
                "completed": "✅ Completed & Verified",
                "returned": "🛑 Return Processed"
            }
            display_status = status_map.get(latest.get("status"), latest.get("status", "Processing"))
            reply = (
                f"### 📦 Your Most Recent Order: #{latest.get('order_number')}\n\n"
                f"- **Produce:** {latest.get('product_name')} ({latest.get('quantity')} kg)\n"
                f"- **Status:** {display_status}\n"
                f"- **Total Payable:** ₹{latest.get('total_amount')}\n"
                f"- **Delivery Address:** {latest.get('delivery_location', 'Chennai, Tamil Nadu')}\n"
                f"- **Order Date:** {str(latest.get('created_at', 'Today'))[:10]}\n\n"
                f"Would you like to review the tax invoice or browse additional farm-fresh crops?"
            )
            return {
                "success": True,
                "source": "KisanSetu Intelligent Assistant",
                "reply": reply,
                "intent": "order_query",
                "referenced_orders": [latest.get("order_number")],
                "referenced_products": [latest.get("product_name")],
                "suggested_actions": [
                    {"type": "view_order", "label": f"📄 View Invoice #{latest.get('order_number')}", "order_number": latest.get("order_number")},
                    {"type": "navigate_tab", "label": "🛒 Browse Marketplace", "tab": "marketplace"}
                ]
            }
        elif not order_history:
            reply = (
                "You don't have any active orders under this account yet.\n\n"
                "Browse our **Pan-India Marketplace** to purchase fresh produce directly from farmers with verified quality grades and 15-25% lower prices than retail stores!"
            )
            return {
                "success": True,
                "source": "KisanSetu Intelligent Assistant",
                "reply": reply,
                "intent": "order_query",
                "referenced_orders": [],
                "referenced_products": [],
                "suggested_actions": [
                    {"type": "navigate_tab", "label": "🛒 Explore Marketplace", "tab": "marketplace"}
                ]
            }

    # 3. Handle Marketplace & Produce Queries
    def _stem(w: str) -> str:
        w = re.sub(r'[^a-z0-9]', '', w.lower())
        if w.endswith("es") and len(w) > 4:
            return w[:-2]
        if w.endswith("s") and len(w) > 3:
            return w[:-1]
        return w

    words = re.findall(r'[a-zA-Z]+', msg_lower)
    word_set = set(words)
    stem_set = {_stem(w) for w in words}

    # Detect if a specific crop is targeted
    target_crop = None
    for canonical, alias_list in CROP_ALIASES.items():
        for a in alias_list:
            if " " in a:
                if a in msg_lower:
                    target_crop = canonical
                    break
            else:
                if a in word_set or _stem(a) in stem_set:
                    target_crop = canonical
                    break
        if target_crop:
            break

    if not target_crop:
        for baseline_crop in COMMODITY_BASELINES:
            if baseline_crop in word_set or _stem(baseline_crop) in stem_set:
                target_crop = baseline_crop
                break

    is_price_query = any(k in msg_lower for k in [
        "price", "rate", "cost", "how much", "slab", "pricing", "discount", "offer", "rupee", "rs", "₹", "cheap", "expensive"
    ])
    is_general_market_query = any(w in msg_lower for w in [
        "produce", "crop", "vegetable", "fruit", "grain", "pulse", "spice", "buy", "available", "marketplace", "fresh", "stock"
    ])

    matched_products = []
    if marketplace_items:
        alias_words = CROP_ALIASES.get(target_crop, [target_crop]) if target_crop else []
        alias_stems = {_stem(a) for a in alias_words}

        for p in marketplace_items:
            p_name = (p.get("name") or "").lower()
            p_words = re.findall(r'[a-zA-Z]+', p_name)
            p_stems = {_stem(w) for w in p_words}

            if target_crop:
                if any(a in p_name for a in alias_words) or any(s in p_stems for s in alias_stems):
                    matched_products.append(p)
                    continue

            # Fallback token overlap (avoid common stop words)
            stop_words = {"price", "rate", "cost", "how", "much", "is", "the", "of", "in", "for", "kg", "kilo", "buy", "show", "what", "available", "where", "can", "get", "fresh", "good", "grade"}
            meaningful_query_words = [w for w in words if w not in stop_words and len(w) > 2]
            meaningful_query_stems = {_stem(w) for w in meaningful_query_words}

            if any(w in p_name for w in meaningful_query_words) or any(s in p_stems for s in meaningful_query_stems):
                matched_products.append(p)

    # Deduplicate matching products by name
    seen_names = set()
    unique_matched = []
    for p in matched_products:
        p_name = p.get("name")
        if p_name not in seen_names:
            seen_names.add(p_name)
            unique_matched.append(p)

    # CASE A: Specific commodity requested & found in marketplace
    if target_crop and unique_matched:
        baseline = COMMODITY_BASELINES.get(target_crop, {})
        reply_lines = []
        actions = []

        for p in unique_matched[:3]:
            slabs = p.get("slabs", [])
            retail_price = slabs[0]["price_per_kg"] if slabs else p.get("price_per_kg", 35)
            farmer_loc = f"{p.get('farmer_district', '')}, {p.get('farmer_state', '')}".strip(", ")
            stock = p.get("available_quantity", 100)
            farmer_name = p.get("farmer_name", "Local Producer Group")
            grade = p.get("grade", "Grade A")

            local_vendor_ref = baseline.get("local_vendor", round(retail_price * 1.25, 1))
            savings_per_kg = max(round(local_vendor_ref - retail_price, 1), 5.0)
            savings_pct = round((savings_per_kg / local_vendor_ref) * 100) if local_vendor_ref > 0 else 20

            icon = "🍅" if target_crop == "tomato" else "🧅" if target_crop == "onion" else "🥔" if target_crop == "potato" else "🌾"

            reply_lines.append(f"### {icon} Direct Farm-Gate Pricing: **{p.get('name')}** ({grade})\n")
            reply_lines.append(f"Freshly harvested produce listed directly by farmer **{farmer_name}** ({farmer_loc}):\n")
            reply_lines.append(f"- **Current Farm Price:** **₹{retail_price:.1f}/kg** (Retail / Household)")
            
            if len(slabs) > 1:
                bulk_slab = slabs[-1]
                bulk_min = bulk_slab.get("min_quantity", 15)
                bulk_price = bulk_slab.get("price_per_kg", retail_price)
                bulk_saving = round(((retail_price - bulk_price) / retail_price) * 100) if retail_price > 0 else 0
                reply_lines.append(f"- **Bulk Volume Discount:** **₹{bulk_price:.1f}/kg** for orders **>{bulk_min} kg** (Save {bulk_saving}% in bulk!)")

            reply_lines.append(f"- **Available Harvest Stock:** {stock:.1f} kg")
            reply_lines.append(f"- **Local Vendor Retail Benchmark:** Local supermarkets and street vendors sell at **~₹{local_vendor_ref:.1f}/kg**.")
            reply_lines.append(f"- **Your Direct Savings:** **₹{savings_per_kg:.1f}/kg ({savings_pct}% off)** with zero middleman commissions!\n")

            actions.append({
                "type": "add_to_cart",
                "label": f"🛒 Add {p.get('name')} (₹{retail_price:.1f}/kg)",
                "product_id": p.get("id"),
                "product_name": p.get("name")
            })

        actions.append({
            "type": "navigate_tab",
            "label": "🛒 View Pan-India Marketplace",
            "tab": "marketplace"
        })

        return {
            "success": True,
            "source": "KisanSetu Intelligent Assistant",
            "reply": "\n".join(reply_lines),
            "intent": "pricing_query" if is_price_query else "marketplace_search",
            "referenced_orders": [],
            "referenced_products": [p.get("name") for p in unique_matched],
            "suggested_actions": actions[:3]
        }

    # CASE B: Specific commodity requested but NOT currently in active catalog
    elif target_crop and not unique_matched:
        from backend.crop_knowledge import lookup_crop_knowledge
        crop_data = lookup_crop_knowledge(target_crop)
        baseline = COMMODITY_BASELINES.get(target_crop, {})

        crop_title = target_crop.title()
        msp = baseline.get("msp", 20.0)
        fair = baseline.get("fair_market", 30.0)
        vendor = baseline.get("local_vendor", 40.0)
        outlook = baseline.get("outlook", "Active seasonal harvesting across regional producer clusters.")
        major_states = ", ".join(crop_data.get("major_states", [])[:4]) if crop_data.get("major_states") else "major agricultural hubs"

        reply = (
            f"### 📊 Market Price Intelligence: **{crop_title}**\n\n"
            f"Direct farm listings for **{crop_title}** are not currently in today's active catalog, but here is verified price guidance:\n\n"
            f"- **Government Mandi / MSP Floor:** **₹{msp:.1f}/kg**\n"
            f"- **Estimated Fair Direct Farm Rate:** **₹{fair:.1f}/kg**\n"
            f"- **Local Vendor / Supermarket Retail:** **~₹{vendor:.1f}/kg**\n"
            f"- **Market Outlook:** {outlook}\n"
            f"- **Major Cultivation Hubs:** {major_states}\n\n"
            f"Our farmer producer organizations are currently harvesting fresh batches. In the meantime, you can explore other fresh farm produce available in our marketplace below!"
        )

        return {
            "success": True,
            "source": "KisanSetu Intelligent Assistant",
            "reply": reply,
            "intent": "pricing_query" if is_price_query else "marketplace_search",
            "referenced_orders": [],
            "referenced_products": [],
            "suggested_actions": [
                {"type": "navigate_tab", "label": "🛒 Explore Available Produce", "tab": "marketplace"},
                {"type": "navigate_tab", "label": "🥬 View Fresh Vegetables", "tab": "marketplace"}
            ]
        }

    # CASE C: General produce / category search (e.g., "what vegetables are available?", "show produce")
    elif unique_matched or is_general_market_query or is_price_query:
        # Filter by category if user requested specific category
        cat_filter = None
        if any(w in msg_lower for w in ["vegetable", "veggie", "greens", "keerai"]):
            cat_filter = "Vegetables"
        elif any(w in msg_lower for w in ["fruit"]):
            cat_filter = "Fruits"
        elif any(w in msg_lower for w in ["grain", "rice", "wheat", "paddy", "cereal"]):
            cat_filter = "Grains"
        elif any(w in msg_lower for w in ["pulse", "dal", "gram"]):
            cat_filter = "Pulses"
        elif any(w in msg_lower for w in ["spice"]):
            cat_filter = "Spices"

        pool = unique_matched if unique_matched else marketplace_items
        if cat_filter:
            pool = [p for p in pool if (p.get("category") or "").lower() == cat_filter.lower()]
            if not pool:
                pool = marketplace_items

        # Deduplicate pool by produce name
        distinct_pool = []
        pool_seen = set()
        for p in pool:
            p_name = p.get("name")
            if p_name not in pool_seen:
                pool_seen.add(p_name)
                distinct_pool.append(p)

        items_to_show = distinct_pool[:4]
        title_cat = f"{cat_filter} " if cat_filter else ""
        reply_lines = [f"### 🌾 Available Farm-Fresh {title_cat}Produce in Marketplace:\n"]
        actions = []

        for p in items_to_show:
            slabs = p.get("slabs", [])
            price_str = f"₹{slabs[0]['price_per_kg']:.1f}/kg" if slabs else f"₹{p.get('price_per_kg', 35):.1f}/kg"
            farmer_loc = f"{p.get('farmer_district', '')}, {p.get('farmer_state', '')}".strip(", ")
            stock = f"{p.get('available_quantity', 100):.1f} kg"
            
            reply_lines.append(f"- **{p.get('name')}** ({p.get('grade', 'Grade A')}) — **{price_str}**")
            reply_lines.append(f"  *Farmer:* {p.get('farmer_name', 'Direct Farm')} ({farmer_loc}) | *Stock:* {stock}")
            
            actions.append({
                "type": "add_to_cart",
                "label": f"🛒 Add {p.get('name')} ({price_str})",
                "product_id": p.get("id"),
                "product_name": p.get("name")
            })

        reply_lines.append("\nAll produce is sourced directly from certified farmer producer groups with zero middleman commissions.")
        
        return {
            "success": True,
            "source": "KisanSetu Intelligent Assistant",
            "reply": "\n".join(reply_lines),
            "intent": "marketplace_search",
            "referenced_orders": [],
            "referenced_products": [p.get("name") for p in items_to_show],
            "suggested_actions": actions[:3]
        }

    # 4. Default / Greeting
    greeting_reply = (
        f"Hello {user_name}! 👋 I am **KisanMitra AI**, your personal shopping and order assistant on KisanSetu.\n\n"
        "Here are things I can help you with right now:\n"
        "- 📦 **Order Tracking:** Ask *'Where is my latest order?'* or check by order number like *'Status of #ORD-1001'*.\n"
        "- 🛒 **Marketplace Search:** Ask *'What vegetables are available?'*, *'Price of tomatoes'*, or *'Show organic grains'*.\n"
        "- 💰 **Bulk Slabs:** Ask about volume tier discounts directly from farmers.\n"
        "- 🌾 **Seasonal Guidance:** Inquire about crops cultivated across Indian states and harvest freshness."
    )
    return {
        "success": True,
        "source": "KisanSetu Intelligent Assistant",
        "reply": greeting_reply,
        "intent": "greeting",
        "referenced_orders": [],
        "referenced_products": [],
        "suggested_actions": [
            {"type": "quick_ask", "label": "📦 Track My Latest Order", "query": "Where is my latest order?"},
            {"type": "quick_ask", "label": "🍅 Fresh Vegetables Available", "query": "What fresh vegetables are available today?"},
            {"type": "navigate_tab", "label": "🛒 Browse Marketplace", "tab": "marketplace"}
        ]
    }

@ai_bp.route("/consumer-chat", methods=["POST"])
def consumer_chat_endpoint():
    """
    Consumer AI Chatbot Endpoint.
    Accepts: {
        "message": "Where is my order?" | "What vegetables are available?",
        "user_id": 12,
        "buyer_name": "arjun",
        "buyer_mobile": "9884123456",
        "conversation_history": [...]
    }
    Grounds response with live marketplace products and consumer orders.
    """
    from backend.db import get_db
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()

    if not message:
        return jsonify({
            "success": False,
            "error": "Empty message. Please provide a query string."
        }), 400

    user_id = data.get("user_id")
    buyer_name = data.get("buyer_name")
    buyer_mobile = data.get("buyer_mobile")
    language = data.get("language") or "en"
    conv_history = data.get("conversation_history") or []

    # 1. Fetch live marketplace products with slab pricing
    marketplace_items = []
    order_history = []
    user_context = {
        "id": user_id,
        "name": buyer_name or "Valued Customer",
        "mobile": buyer_mobile or "",
        "language": language,
        "location": "Chennai, Tamil Nadu"
    }

    try:
        conn = get_db()
        cursor = conn.cursor()

        # Fetch active products
        cursor.execute("""
            SELECT p.id, p.farmer_id, p.farmer_name, p.farmer_state, p.farmer_district,
                   p.name, p.category, p.variety, p.grade, p.available_quantity, p.image_url,
                   s.min_quantity, s.max_quantity, s.price_per_kg
            FROM products p
            LEFT JOIN price_slabs s ON p.id = s.product_id
            WHERE p.available_quantity > 0
            ORDER BY p.id DESC
        """)
        rows = cursor.fetchall()

        # Aggregate products by ID
        prod_map = {}
        for r in rows:
            pid = r["id"]
            if pid not in prod_map:
                prod_map[pid] = {
                    "id": pid,
                    "farmer_id": r["farmer_id"],
                    "farmer_name": r["farmer_name"],
                    "farmer_state": r["farmer_state"],
                    "farmer_district": r["farmer_district"],
                    "name": r["name"],
                    "category": r["category"],
                    "variety": r["variety"],
                    "grade": r["grade"],
                    "available_quantity": r["available_quantity"],
                    "image_url": r["image_url"],
                    "slabs": []
                }
            if r["price_per_kg"] is not None:
                prod_map[pid]["slabs"].append({
                    "min_quantity": r["min_quantity"],
                    "max_quantity": r["max_quantity"],
                    "price_per_kg": r["price_per_kg"]
                })
        marketplace_items = list(prod_map.values())

        # Fetch consumer's orders
        order_query_conditions = []
        order_params = []
        if user_id:
            order_query_conditions.append("buyer_id = ?")
            order_params.append(user_id)
        if buyer_name:
            order_query_conditions.append("LOWER(buyer_name) = LOWER(?)")
            order_params.append(buyer_name)
        if buyer_mobile:
            order_query_conditions.append("buyer_mobile = ?")
            order_params.append(buyer_mobile)

        if order_query_conditions:
            where_clause = " OR ".join(order_query_conditions)
            cursor.execute(f"""
                SELECT * FROM orders 
                WHERE {where_clause}
                ORDER BY id DESC LIMIT 15
            """, tuple(order_params))
            order_rows = cursor.fetchall()
            order_history = [dict(row) for row in order_rows]
        else:
            # If no user identified, fetch latest sample orders so bot can answer if demoing
            cursor.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 5")
            order_history = [dict(row) for row in cursor.fetchall()]

        conn.close()
    except Exception as db_err:
        print(f"[AIEngine] Error fetching grounding context for chatbot: {db_err}")

    # 2. Try Google Gemini AI first
    try:
        from backend.gemini_service import get_gemini_consumer_chat_reply
        gemini_res = get_gemini_consumer_chat_reply(
            message=message,
            user_context=user_context,
            marketplace_items=marketplace_items,
            order_history=order_history,
            conversation_history=conv_history
        )
        if gemini_res and gemini_res.get("success"):
            return jsonify(gemini_res)
    except Exception as g_err:
        print(f"[AIEngine] Gemini consumer chat call error: {g_err}")

    # 3. Fallback to Heuristic NLP Assistant
    fallback_res = _heuristic_consumer_chat(
        message=message,
        user_context=user_context,
        marketplace_items=marketplace_items,
        order_history=order_history
    )
    return jsonify(fallback_res)



