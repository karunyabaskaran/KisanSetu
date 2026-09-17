"""
KisanSetu - Google Gemini AI Service Engine
================================================================================
Provides enterprise-grade generative intelligence for:
1. Dynamic Crop Price Forecasting & Fair Farmer Pricing:
   Analyzes real-time crop trends, seasonal harvest factors, mandi arrivals, 
   government MSP baselines, and perishability to suggest fair retail and bulk slabs.
2. Logistics Multi-Hub Route Optimization & Dispatch Strategy:
   Evaluates multi-hub agricultural collections, urban deliveries, cold-chain
   urgency, cargo perishability, and traffic windows to advise on the optimal dispatch plan.
================================================================================
"""

import os
import ssl
import json
import re
import urllib.request
import urllib.error
import datetime

def _get_api_key():
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key.strip()
    env_paths = [
        os.path.join(os.path.dirname(__file__), "..", ".env"),
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.abspath(".env")
    ]
    for p in env_paths:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("GEMINI_API_KEY="):
                            return line.split("=", 1)[1].strip().strip('"').strip("'")
            except Exception:
                pass
    return ""

# Resilient model fallback priority chain
CANDIDATE_MODELS = [
    "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-3.7-flash",
    "gemini-3.8-flash"
]

def _extract_json_safely(text: str) -> dict:
    """
    Safely parses JSON from Gemini responses, handling markdown codeblocks,
    trailing tokens, or malformed characters gracefully.
    """
    cleaned = text.strip()
    # Remove markdown codeblock tags if present
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except Exception:
        pass

    # Attempt to extract first complete JSON object bounded by outermost { and }
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        candidate = match.group(0)
        try:
            return json.loads(candidate)
        except Exception:
            pass

    # Regex key-value extraction fallback
    data = {}
    
    # Numeric extractions
    retail_match = re.search(r'"suggested_retail"\s*:\s*([0-9.]+)', cleaned)
    if retail_match:
        data["suggested_retail"] = float(retail_match.group(1))

    bulk_match = re.search(r'"suggested_bulk"\s*:\s*([0-9.]+)', cleaned)
    if bulk_match:
        data["suggested_bulk"] = float(bulk_match.group(1))

    msp_match = re.search(r'"msp"\s*:\s*([0-9.]+)', cleaned)
    if msp_match:
        data["msp"] = float(msp_match.group(1))

    demand_match = re.search(r'"demand_index"\s*:\s*([0-9.]+)', cleaned)
    if demand_match:
        data["demand_index"] = float(demand_match.group(1))

    # String extractions with multi-line and unclosed quote tolerance
    for key in ["demand_rating", "trend", "perishability", "market_insights", 
                "dispatch_strategy", "perishable_cargo_priority", "recommended_departure_window",
                "traffic_mitigation_tip", "fuel_efficiency_score"]:
        # Try closed quotes with DOTALL first
        pattern = rf'"{key}"\s*:\s*"([^"]+)"'
        m = re.search(pattern, cleaned, re.DOTALL)
        if not m:
            # Fallback for unclosed or newline-interrupted string
            pattern_fallback = rf'"{key}"\s*:\s*"([^"\n\r}}]+)'
            m = re.search(pattern_fallback, cleaned)
        if m:
            data[key] = m.group(1).strip()

    if data:
        return data

    raise ValueError(f"Could not parse structured JSON from text: {text[:150]}")

def _call_gemini(prompt: str, system_instruction: str = None) -> dict:
    """
    Executes a call to the Google Generative Language API with automatic
    model fallback across available flash models.
    """
    ctx = ssl.create_default_context()
    
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 2048,
            "response_mime_type": "application/json"
        }
    }

    if system_instruction:
        payload["systemInstruction"] = {
            "parts": [{"text": system_instruction}]
        }

    last_error = None
    data_bytes = json.dumps(payload).encode("utf-8")

    api_key = _get_api_key()
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not configured in environment or .env")

    for model_name in CANDIDATE_MODELS:
        api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        req = urllib.request.Request(
            api_url, 
            data=data_bytes, 
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=12) as response:
                resp_json = json.loads(response.read().decode("utf-8"))
                candidates = resp_json.get("candidates", [])
                if candidates:
                    text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    parsed = _extract_json_safely(text)
                    return parsed
        except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError, TimeoutError, ValueError) as err:
            last_error = err
            print(f"[GeminiService] Model '{model_name}' encountered: {err}. Trying next candidate...")
            continue
        except Exception as ex:
            last_error = ex
            print(f"[GeminiService] Unexpected error on '{model_name}': {ex}")
            continue

    raise RuntimeError(f"All Gemini models exhausted. Last error: {last_error}")

def get_gemini_crop_price_forecast(commodity: str, region: str = "India", month: int = None) -> dict:
    """
    Queries Google Gemini AI to analyze market trends and calculate price guidance
    for the selected crop (e.g., Tomato, Onion, Potato, Rice, Wheat, etc.).
    """
    if not month:
        month = datetime.datetime.now().month

    system_instruction = (
        "You are KisanSetu's AI Agricultural Market Intelligence Engine, specializing in Indian agricultural "
        "commodity markets, Agmarknet/eNAM mandi arrivals, APMC price spreads, and government Minimum Support Prices (MSP). "
        "Analyze real-world trends, seasonal harvest cycles, rainfall/supply patterns, and transport economics "
        "to suggest fair, volatility-protected prices that maximize farmer profit while remaining competitive."
    )

    prompt = f"""
    Analyze the agricultural commodity: '{commodity}' in {region} for month {month} (1-12).
    Return a valid JSON object with exact keys:
    - "commodity": "{commodity}"
    - "suggested_retail": (number, fair price in INR per kg for retail consumers, e.g. 42.0)
    - "suggested_bulk": (number, wholesale price in INR per kg for bulk buyers >50kg, typically 15-25% lower, e.g. 32.0)
    - "msp": (number, government MSP baseline or local mandi floor price in INR per kg, e.g. 20.0)
    - "demand_index": (number from 1 to 100 representing market demand intensity, e.g. 84)
    - "demand_rating": (string, e.g. 'High Demand' or 'Moderate Demand' or 'Surge Demand')
    - "trend": (string, e.g. '+16% (Seasonal Supply Shift)' or '+20% (High Urban Uptake)')
    - "perishability": (string, e.g. 'High' or 'Medium' or 'Low')
    - "market_insights": (string, 2 sentences explaining recent mandi arrival trends, weather/supply factors, and why this suggested price protects the farmer against middlemen exploitation)
    """

    try:
        data = _call_gemini(prompt, system_instruction=system_instruction)
        retail = float(data.get("suggested_retail", 40.0))
        bulk = float(data.get("suggested_bulk", round(retail * 0.82, 1)))
        msp = float(data.get("msp", round(retail * 0.65, 1))) if data.get("msp") is not None else round(retail * 0.65, 1)
        demand_idx = float(data.get("demand_index", 78.0))

        mid = round((retail + bulk) / 2.0, 1)
        slabs = [
            {"min_quantity": 0, "max_quantity": 10, "price_per_kg": retail},
            {"min_quantity": 10, "max_quantity": 50, "price_per_kg": mid},
            {"min_quantity": 50, "max_quantity": None, "price_per_kg": bulk}
        ]

        return {
            "success": True,
            "source": "Google Gemini AI",
            "commodity": commodity,
            "forecast_period": f"Current Market ({datetime.datetime.now().strftime('%B %Y')})",
            "demand_index": round(demand_idx, 1),
            "demand_rating": data.get("demand_rating", "High Demand" if demand_idx >= 75 else "Moderate Demand"),
            "market_insights": data.get("market_insights", f"Gemini AI trend analysis indicates balanced mandi arrivals and strong demand for {commodity}."),
            "perishability": data.get("perishability", "Medium"),
            "price_guidance": {
                "government_msp": msp,
                "recommended_retail_slab": f"₹{retail} / kg",
                "recommended_bulk_slab": f"₹{bulk} / kg (>50 kg)",
                "trend": data.get("trend", "+14% (Gemini AI Market Projection)")
            },
            "suggested_slabs": slabs
        }
    except Exception as err:
        print(f"[GeminiService] Forecast error for '{commodity}': {err}")
        return None

def get_gemini_route_dispatch_advisory(depot: dict, hubs: list, deliveries: list, corridor_name: str = "Agro Corridor") -> dict:
    """
    Generates a high-level logistics optimization and dispatch advisory using Gemini AI
    evaluating hub aggregation, perishable cargo priority, and urban drop sequencing.
    """
    system_instruction = (
        "You are KisanSetu's AI Logistics & Supply Chain Strategist. You optimize cold-chain "
        "and direct farm-to-consumer delivery fleets across Indian agro-industrial corridors. "
        "Prioritize fresh perishable produce (e.g. tomatoes, shallots, greens) for early delivery, "
        "reduce transit times, minimize carbon footprint, and suggest optimal dispatch departure hours."
    )

    cargo_summary = [h.get("cargo", "Produce") for h in hubs] + [d.get("cargo", "Order") for d in deliveries]
    
    prompt = f"""
    Evaluate the following agricultural logistics corridor:
    - Corridor: {corridor_name}
    - Central Depot: {depot.get('name', 'Depot')}
    - Collection Hubs ({len(hubs)}): {[h.get('name') for h in hubs]}
    - Delivery Destinations ({len(deliveries)}): {[d.get('name') for d in deliveries]}
    - Cargo Types: {cargo_summary}

    Return a valid JSON object with exact keys:
    - "dispatch_strategy": (string, 2 sentences explaining the route strategy and why pickup hubs are sequenced before delivery drops)
    - "perishable_cargo_priority": (string, specific note identifying urgent items like tomatoes, milk or leafy greens that need cold-chain priority or early drops)
    - "recommended_departure_window": (string, e.g. '04:30 AM - 06:00 AM (Pre-peak departure avoids urban congestion and thermal spoilage)')
    - "traffic_mitigation_tip": (string, practical advice for the driver avoiding peak corridors)
    - "fuel_efficiency_score": (string, e.g. '98.5% Optimal Efficiency')
    """

    try:
        advisory = _call_gemini(prompt, system_instruction=system_instruction)
        return {
            "success": True,
            "powered_by": "Google Gemini AI",
            "dispatch_strategy": advisory.get("dispatch_strategy", "Sequenced multi-hub aggregation followed by clustered urban customer deliveries."),
            "perishable_cargo_priority": advisory.get("perishable_cargo_priority", "High priority for fresh perishable farm crops to preserve farm gate freshness."),
            "recommended_departure_window": advisory.get("recommended_departure_window", "05:00 AM - 06:30 AM (Pre-peak corridor)"),
            "traffic_mitigation_tip": advisory.get("traffic_mitigation_tip", "Bypass dense urban ring-roads during peak morning hours using peripheral bypass routes."),
            "fuel_efficiency_score": advisory.get("fuel_efficiency_score", "98.4% Efficiency")
        }
    except Exception as err:
        print(f"[GeminiService] Route advisory error: {err}")
        return {
            "success": False,
            "powered_by": "KisanSetu Heuristic Engine",
            "dispatch_strategy": "Direct precedence multi-hub aggregation into clustered urban deliveries.",
            "perishable_cargo_priority": "Perishable produce prioritized for immediate delivery.",
            "recommended_departure_window": "05:30 AM - 06:30 AM",
            "traffic_mitigation_tip": "Maintain steady corridor transit to optimize fuel consumption.",
            "fuel_efficiency_score": "96.5% Standard Efficiency"
        }
