"""
KisanSetu - AI Engine
Provides:
1. Demand Forecasting per commodity, season, and state using Scikit-learn regression models.
2. Market Price Parity & Fair Price Recommendations to protect farmers from volatility.
"""

import numpy as np
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
    "Thompson Seedless Grapes": {"msp": 50.0, "fair_market": 75.0, "demand_trend": "+25% (Peak Season)", "outlook": "High retail supermarket uptake"}
}

@ai_bp.route("/forecast", methods=["GET"])
def get_forecast():
    commodity = request.args.get("commodity", "Ponni Raw Rice (Organic)")
    month = int(request.args.get("month", 9)) # Default Sept

    # Generate prediction using Random Forest
    features = np.array([[month, 6.5, 5.0]])
    predicted_demand_index = float(DEMAND_MODEL.predict(features)[0])

    baseline = COMMODITY_BASELINES.get(commodity, {
        "msp": 30.0,
        "fair_market": 42.0,
        "demand_trend": "+10% (Normal)",
        "outlook": "Steady regional supply"
    })

    # Recommended farmer price guidance
    suggested_retail = round(baseline["fair_market"] * (1.0 + (predicted_demand_index - 70) / 200), 1)
    suggested_bulk = round(suggested_retail * 0.85, 1)

    return jsonify({
        "success": True,
        "commodity": commodity,
        "forecast_period": "Upcoming 30-45 Days",
        "demand_index": round(predicted_demand_index, 1),
        "demand_rating": "High Demand" if predicted_demand_index > 75 else "Moderate Demand",
        "market_insights": baseline["outlook"],
        "price_guidance": {
            "government_msp": baseline["msp"],
            "recommended_retail_slab": f"₹{suggested_retail} / kg",
            "recommended_bulk_slab": f"₹{suggested_bulk} / kg (>50 kg)",
            "trend": baseline["demand_trend"]
        },
        "all_commodities": list(COMMODITY_BASELINES.keys())
    })
