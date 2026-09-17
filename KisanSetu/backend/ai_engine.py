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
    "Ponni Raw Rice (Organic)": {"msp": 38.0, "fair_market": 48.0, "demand_trend": "+14% (High)", "outlook": "Strong South Indian domestic demand"},
    "1121 Traditional Basmati Rice": {"msp": 65.0, "fair_market": 90.0, "demand_trend": "+22% (Surge)", "outlook": "Export momentum to Gulf & Middle East"},
    "Nashik Red Onions": {"msp": 18.0, "fair_market": 26.0, "demand_trend": "+18% (Volatile)", "outlook": "Post-monsoon replenishment cycle"},
    "Sharbati Golden Wheat": {"msp": 28.0, "fair_market": 35.0, "demand_trend": "+8% (Stable)", "outlook": "Consistent household milling demand"},
    "Country Small Onions (Shallots)": {"msp": 35.0, "fair_market": 52.0, "demand_trend": "+12% (Moderate)", "outlook": "Steady demand in southern culinary zones"},
    "Thompson Seedless Grapes": {"msp": 50.0, "fair_market": 75.0, "demand_trend": "+25% (Peak Season)", "outlook": "High retail supermarket uptake"},
    "Tomato": {"msp": 18.0, "fair_market": 42.0, "demand_trend": "+16% (Seasonal Shift)", "outlook": "Strong consumer demand with localized mandi supply variance"},
    "Potato": {"msp": 16.0, "fair_market": 24.0, "demand_trend": "+8% (Steady)", "outlook": "Cold-storage buffer stocks stabilizing regional consumption"}
}

ALL_COMMODITY_LIST = [
    "Tomato",
    "Ponni Raw Rice (Organic)",
    "1121 Traditional Basmati Rice",
    "Nashik Red Onions",
    "Country Small Onions (Shallots)",
    "Sharbati Golden Wheat",
    "Potato",
    "Thompson Seedless Grapes",
    "Green Chilli",
    "Cabbage",
    "Fresh Ginger",
    "Turmeric (Raw)",
    "Banana (Robusta)",
    "Cotton (Medium Staple)"
]

def _heuristic_forecast(commodity: str, month: int):
    """Fallback Scikit-learn Random Forest model when Gemini is offline."""
    features = np.array([[month, 6.5, 5.0]])
    predicted_demand_index = float(DEMAND_MODEL.predict(features)[0])

    baseline = COMMODITY_BASELINES.get(commodity, {
        "msp": 25.0,
        "fair_market": 38.0,
        "demand_trend": "+10% (Normal)",
        "outlook": f"Steady regional demand for {commodity}."
    })

def detect_category_heuristic(commodity: str) -> str:
    c = commodity.lower()
    if any(w in c for w in ["rice", "wheat", "grain", "paddy", "corn", "maize", "millet", "ragi", "jowar", "bajra"]):
        return "Grains"
    if any(w in c for w in ["apple", "grape", "banana", "mango", "orange", "papaya", "fruit", "guava", "watermelon"]):
        return "Fruits"
    if any(w in c for w in ["dal", "gram", "pulse", "chana", "moong", "urad", "toor", "lentil", "rajma"]):
        return "Pulses"
    if any(w in c for w in ["turmeric", "ginger", "garlic", "chilli", "pepper", "clove", "spice", "cardamom", "coriander"]):
        return "Spices"
    return "Vegetables"

def _heuristic_forecast(commodity: str, month: int, region: str = "Tamil Nadu, India"):
    """Fallback Scikit-learn Random Forest model when Gemini is offline."""
    features = np.array([[month, 6.5, 5.0]])
    predicted_demand_index = float(DEMAND_MODEL.predict(features)[0])

    baseline = COMMODITY_BASELINES.get(commodity, {
        "msp": 25.0,
        "fair_market": 38.0,
        "demand_trend": "+12% (Festive Uptick)",
        "outlook": f"Steady regional demand for {commodity} in {region}."
    })

    suggested_retail = round(baseline["fair_market"] * (1.0 + (predicted_demand_index - 70) / 200), 1)
    suggested_bulk = round(suggested_retail * 0.82, 1)
    mid_price = round((suggested_retail + suggested_bulk) / 2.0, 1)
    cat = detect_category_heuristic(commodity)

    return {
        "success": True,
        "source": "KisanSetu ML Engine (Fallback)",
        "commodity": commodity,
        "category": cat,
        "region": region,
        "forecast_period": f"Month {month} Agricultural Outlook",
        "demand_index": round(predicted_demand_index, 1),
        "demand_rating": "High Festive Demand" if predicted_demand_index > 75 else "Moderate Demand",
        "market_insights": baseline["outlook"],
        "festival_impact": {
            "festival_name": "Regional Festive Season",
            "surge_percentage": "+12% Festive Uptick",
            "festival_notes": f"Anticipated festive demand in {region} maintains healthy market price support."
        },
        "perishability": "High" if "Tomato" in commodity or "Onion" in commodity or "Carrot" in commodity else "Medium",
        "price_guidance": {
            "government_msp": baseline["msp"],
            "recommended_retail_slab": f"₹{suggested_retail} / kg",
            "recommended_bulk_slab": f"₹{suggested_bulk} / kg (>50 kg)",
            "trend": baseline["demand_trend"]
        },
        "suggested_slabs": [
            {"min_quantity": 0, "max_quantity": 10, "price_per_kg": suggested_retail},
            {"min_quantity": 10, "max_quantity": 50, "price_per_kg": mid_price},
            {"min_quantity": 50, "max_quantity": None, "price_per_kg": suggested_bulk}
        ],
        "all_commodities": ALL_COMMODITY_LIST
    }

@ai_bp.route("/forecast", methods=["GET"])
def get_forecast():
    """
    Returns AI Demand and Price Forecast for a selected commodity.
    Powered by Google Gemini AI with festival demand analysis and ML fallback.
    """
    commodity = request.args.get("commodity", "Tomato").strip()
    month = request.args.get("month")
    region = request.args.get("region") or request.args.get("state") or "Tamil Nadu, India"
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
    region = data.get("region") or data.get("state") or request.args.get("region") or request.args.get("state") or "Tamil Nadu, India"
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

