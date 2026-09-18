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
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
    "gemini-3.7-flash"
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

    local_match = re.search(r'"local_vendor_price"\s*:\s*([0-9.]+)', cleaned)
    if local_match:
        data["local_vendor_price"] = float(local_match.group(1))

    savings_match = re.search(r'"savings_percentage"\s*:\s*([0-9.]+)', cleaned)
    if savings_match:
        data["savings_percentage"] = float(savings_match.group(1))

    msp_match = re.search(r'"msp"\s*:\s*([0-9.]+)', cleaned)
    if msp_match:
        data["msp"] = float(msp_match.group(1))

    demand_match = re.search(r'"demand_index"\s*:\s*([0-9.]+)', cleaned)
    if demand_match:
        data["demand_index"] = float(demand_match.group(1))

    # String extractions with multi-line and unclosed quote tolerance
    for key in ["demand_rating", "trend", "perishability", "market_insights", 
                "category", "festival_name", "festival_notes", "festival_surge_percentage",
                "local_vendor_comparison", "dispatch_strategy", "perishable_cargo_priority", 
                "recommended_departure_window", "traffic_mitigation_tip", "fuel_efficiency_score", "relay_hub_advice"]:
        pattern = rf'"{key}"\s*:\s*"([^"]+)"'
        m = re.search(pattern, cleaned, re.DOTALL)
        if not m:
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
            with urllib.request.urlopen(req, context=ctx, timeout=7) as response:
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

def get_gemini_crop_price_forecast(commodity: str, region: str = "Tamil Nadu, India", month: int = None) -> dict:
    """
    Queries Google Gemini AI to analyze market trends and calculate fair, direct farm-gate pricing
    for the selected crop in the farmer's specific location.
    Grounded with state-wise cultivation data & September 2026 price benchmarks from india-crops-statewise.md.
    Crucially: Estimates local retail vendor prices and prices farm-gate produce 15-25% lower than local vendors,
    giving consumers huge savings while providing farmers higher margins by eliminating intermediaries.
    """
    if not month:
        month = datetime.datetime.now().month

    from backend.crop_knowledge import lookup_crop_knowledge
    crop_info = lookup_crop_knowledge(commodity, region)

    grounding_context = ""
    if crop_info.get("found"):
        grounding_context = f"""
    AUTHORITATIVE STATE-WISE CULTIVATION BENCHMARK (INDIA CROPS GUIDE, SEPT 2026):
    - Canonical Crop Name: {crop_info['canonical_name']}
    - Crop Category: {crop_info['category']}
    - Major Cultivation States: {', '.join(crop_info['major_states'])}
    - Farmer Region ({region}) Cultivation Status: {'LEADING PRODUCING HUB' if crop_info['is_major_producer'] else 'CONSUMING / TRANSIT REGION'}
    - Indicative Retail Price Range: {crop_info['indicative_price_str']} INR/kg
    - State Cultivation Dynamics: {crop_info['state_insight']}
    Ground your local vendor price estimate and farm-gate discount in this official benchmark.
    """

    system_instruction = (
        "You are KisanSetu's AI Agricultural Market, Pricing & Mandi Intelligence Engine. "
        "Your mission is to establish fair, direct-from-farmer pricing that eliminates extortionate middleman margins. "
        "You possess deep knowledge of state-wise Indian agricultural geography, leading production hubs, and APMC mandi flows. "
        "Estimate the prevailing local street vendor / retail market price for the produce in the farmer's specific location, "
        "and calculate a recommended direct farm-gate retail price that is COMPARATIVELY LESS (15% to 25% lower) than local street vendors, "
        "so consumers save money while the farmer receives a substantially higher, more profitable net realization than distress mandi sales."
    )

    prompt = f"""
    Analyze agricultural commodity '{commodity}' produced in farmer's location: '{region}' for month {month} (1-12).
    {grounding_context}
    Tasks:
    1. Estimate the prevailing local retail street vendor / local market price in INR per kg for '{commodity}' in '{region}' ('local_vendor_price'), adhering closely to the provided state-wise benchmark.
    2. Calculate a direct farm-gate retail price ('suggested_retail') that is 15% to 25% CHEAPER than the local vendor price (eliminating intermediary markups).
    3. Calculate a bulk wholesale price ('suggested_bulk') for orders >50kg, typically 15-20% lower than suggested_retail.
    4. Provide the government MSP or mandi benchmark floor price ('msp') in INR/kg.
    5. Calculate savings percentage for consumers buying directly from farmer ('savings_percentage', integer, e.g. 20).
    6. Provide a concise comparison statement ('local_vendor_comparison') explaining the savings vs local vendors and highlighting the farmer's state cultivation advantage.
    7. Identify any recent or upcoming regional festivals in '{region}' impacting demand for '{commodity}'.

    Return a valid JSON object with exact keys:
    - "commodity": "{crop_info['canonical_name'] if crop_info.get('found') else commodity}"
    - "category": (one of: "Vegetables", "Fruits", "Grains", "Pulses", "Spices", "Herbs")
    - "local_vendor_price": (number, prevailing street vendor/market price in INR/kg, e.g. 45.0)
    - "suggested_retail": (number, direct farm price in INR/kg, strictly 15-25% lower than local_vendor_price, e.g. 35.0)
    - "suggested_bulk": (number, bulk wholesale price in INR/kg for >50kg, e.g. 29.0)
    - "msp": (number, government MSP baseline or APMC mandi floor in INR/kg, e.g. 20.0)
    - "savings_percentage": (number, percentage savings vs local vendors, e.g. 22)
    - "local_vendor_comparison": (string, e.g. "Local vendors charge ~₹45/kg in {region}. Direct farm price of ₹35/kg is 22% cheaper for consumers while giving the farmer direct profit.")
    - "demand_index": (number from 1 to 100 representing market demand, e.g. 84)
    - "demand_rating": (string, e.g. 'High Demand' or 'Moderate Demand' or 'Peak Festive Surge')
    - "trend": (string, e.g. '+18% (Direct Farm-to-Fork Advantage)')
    - "perishability": (string, e.g. 'High' or 'Medium' or 'Low')
    - "festival_name": (string, primary relevant festival/season in {region} or 'Regional Harvest Season')
    - "festival_surge_percentage": (string, e.g. '+15% Seasonal Uptick')
    - "festival_notes": (string, 1-2 sentences on consumption trends for {commodity} in {region})
    - "market_insights": (string, 1-2 sentences summarizing mandi arrival volumes, state cultivation, and fair pricing protection)
    """

    try:
        data = _call_gemini(prompt, system_instruction=system_instruction)
        
        # Extract and sanitize numeric prices
        raw_retail = data.get("suggested_retail")
        raw_bulk = data.get("suggested_bulk")
        raw_local = data.get("local_vendor_price")
        raw_msp = data.get("msp")

        def _clean_num(v, default):
            if v is None:
                return default
            if isinstance(v, (int, float)):
                return float(v)
            num_match = re.search(r'([0-9.]+)', str(v))
            return float(num_match.group(1)) if num_match else default

        retail = _clean_num(raw_retail, 35.0)
        local_vendor = _clean_num(raw_local, round(retail * 1.25, 1))

        # Guarantee that farm-gate price is strictly less than local vendor price (at least 15% lower)
        if retail >= local_vendor or local_vendor <= 0:
            local_vendor = round(retail * 1.25, 1)
            retail = round(local_vendor * 0.80, 1)
        elif (local_vendor - retail) / local_vendor < 0.12:
            retail = round(local_vendor * 0.80, 1)

        bulk = _clean_num(raw_bulk, round(retail * 0.82, 1))
        if bulk >= retail:
            bulk = round(retail * 0.82, 1)

        msp = _clean_num(raw_msp, round(retail * 0.65, 1))
        demand_idx = _clean_num(data.get("demand_index"), 80.0)

        # Savings percentage vs local vendors
        savings_pct = int(round(((local_vendor - retail) / local_vendor) * 100))
        if savings_pct < 10:
            savings_pct = 20

        mid = round((retail + bulk) / 2.0, 1)
        slabs = [
            {"min_quantity": 0, "max_quantity": 10, "price_per_kg": retail},
            {"min_quantity": 10, "max_quantity": 50, "price_per_kg": mid},
            {"min_quantity": 50, "max_quantity": None, "price_per_kg": bulk}
        ]

        cat = data.get("category", "Vegetables")
        fest_name = data.get("festival_name", "Regional Harvest Season")
        fest_surge = data.get("festival_surge_percentage", "+12% Seasonal Uptick")
        fest_notes = data.get("festival_notes", f"Active culinary demand across {region}.")
        comparison = data.get("local_vendor_comparison", f"Local retail vendors charge ~₹{local_vendor}/kg in {region}. Direct farm price ₹{retail}/kg is {savings_pct}% cheaper for buyers.")

        return {
            "success": True,
            "source": "Google Gemini AI",
            "commodity": crop_info.get("canonical_name") if crop_info.get("found") else commodity,
            "category": cat,
            "region": region,
            "is_major_producing_hub": crop_info.get("is_major_producer", False),
            "matched_state": crop_info.get("matched_state"),
            "major_growing_states": crop_info.get("major_states", []),
            "indicative_price_range": crop_info.get("indicative_price_str", ""),
            "state_cultivation_insight": crop_info.get("state_insight", ""),
            "forecast_period": f"Current Market & Festivals ({datetime.datetime.now().strftime('%B %Y')})",
            "demand_index": round(demand_idx, 1),
            "demand_rating": data.get("demand_rating", "High Demand" if demand_idx >= 75 else "Moderate Demand"),
            "local_vendor_price": local_vendor,
            "savings_percentage": savings_pct,
            "local_vendor_comparison": comparison,
            "market_insights": data.get("market_insights", comparison),
            "festival_impact": {
                "festival_name": fest_name,
                "surge_percentage": fest_surge,
                "festival_notes": fest_notes
            },
            "perishability": data.get("perishability", "Medium"),
            "price_guidance": {
                "local_vendor_price": local_vendor,
                "savings_percentage": savings_pct,
                "government_msp": msp,
                "recommended_retail_slab": f"₹{retail} / kg",
                "recommended_bulk_slab": f"₹{bulk} / kg (>50 kg)",
                "trend": data.get("trend", f"{savings_pct}% Cheaper than Local Vendors")
            },
            "suggested_slabs": slabs
        }
    except Exception as err:
        print(f"[GeminiService] Forecast error for '{commodity}': {err}")
        return None

def get_gemini_route_dispatch_advisory(depot: dict, hubs: list, deliveries: list, corridor_name: str = "Agro Corridor") -> dict:
    """
    Generates an intelligent logistics optimization and multi-hub dispatch advisory using Gemini AI:
    1. Sequenced multi-hub aggregation (Farmer location -> Nearest Aggregation Hub).
    2. Best route to on-corridor deliveries.
    3. Relay Hub Dropoff: If any delivery is out-of-route, advises dropping consignment at an on-route relay hub.
    """
    system_instruction = (
        "You are KisanSetu's AI Logistics & Supply Chain Strategist specializing in Indian agro-industrial corridors. "
        "Optimize delivery routing with a multi-hub relay model: "
        "First, farmer produce is aggregated at the nearest rural hub. "
        "Second, on-corridor consumer deliveries are fulfilled directly. "
        "Third, any destination located far outside the primary route is designated to be dropped at a "
        "Transit Relay Hub along the route for last-mile secondary distribution, preventing transit backtracking."
    )

    cargo_summary = [h.get("cargo", "Produce") for h in hubs] + [d.get("cargo", "Order") for d in deliveries]
    
    prompt = f"""
    Evaluate the following agricultural logistics corridor:
    - Corridor: {corridor_name}
    - Central Depot: {depot.get('name', 'Central Depot')}
    - Collection Hubs ({len(hubs)}): {[h.get('name') for h in hubs]}
    - Delivery Destinations ({len(deliveries)}): {[d.get('name') for d in deliveries]}
    - Cargo Types: {cargo_summary}

    Return a valid JSON object with exact keys:
    - "dispatch_strategy": (string, 2 sentences explaining the route strategy starting from farmer nearest hub aggregation to doorstep deliveries)
    - "perishable_cargo_priority": (string, specific note identifying urgent items like carrots, tomatoes or greens requiring early morning transit)
    - "relay_hub_advice": (string, guidance for any out-of-route drops: identify that off-corridor orders should be handed over to intermediate relay hubs along the route)
    - "recommended_departure_window": (string, e.g. '04:30 AM - 06:00 AM (Early morning departure minimizes thermal stress and urban gridlock)')
    - "traffic_mitigation_tip": (string, practical driver advice for Google Maps navigation avoiding bottlenecks)
    - "fuel_efficiency_score": (string, e.g. '98.5% Optimal Green Corridor')
    """

    try:
        advisory = _call_gemini(prompt, system_instruction=system_instruction)
        return {
            "success": True,
            "powered_by": "Google Gemini AI",
            "dispatch_strategy": advisory.get("dispatch_strategy", "Sequenced aggregation at the nearest regional hub followed by direct corridor deliveries and relay hub transfers."),
            "perishable_cargo_priority": advisory.get("perishable_cargo_priority", "High priority for fresh perishable farm crops to preserve farm gate freshness."),
            "relay_hub_advice": advisory.get("relay_hub_advice", "Out-of-corridor deliveries will be dropped at intermediate transit hubs along the route for local last-mile relay distribution."),
            "recommended_departure_window": advisory.get("recommended_departure_window", "04:30 AM - 06:00 AM (Pre-peak corridor)"),
            "traffic_mitigation_tip": advisory.get("traffic_mitigation_tip", "Follow Google Maps Live Traffic navigation to bypass urban signals via peripheral ring roads."),
            "fuel_efficiency_score": advisory.get("fuel_efficiency_score", "98.4% Efficiency")
        }
    except Exception as err:
        print(f"[GeminiService] Route advisory error: {err}")
        return {
            "success": False,
            "powered_by": "KisanSetu Heuristic Engine",
            "dispatch_strategy": "Direct precedence multi-hub aggregation into clustered urban deliveries with relay hub dropoffs.",
            "perishable_cargo_priority": "Perishable produce prioritized for immediate delivery.",
            "relay_hub_advice": "Out-of-corridor orders are transferred to intermediate relay hubs on the delivery route.",
            "recommended_departure_window": "05:00 AM - 06:30 AM",
            "traffic_mitigation_tip": "Maintain steady corridor transit using Google Maps to optimize fuel consumption.",
            "fuel_efficiency_score": "96.5% Standard Efficiency"
        }

def get_gemini_consumer_chat_reply(
    message: str,
    user_context: dict = None,
    marketplace_items: list = None,
    order_history: list = None,
    conversation_history: list = None
) -> dict:
    """
    Generates an intelligent, grounded conversational response for KisanSetu consumers.
    Can answer questions about:
    1. Marketplace produce: availability, freshness, categories, slab pricing, farmer source regions.
    2. Order details: order status, live tracking checkpoints, items, amounts, inspection windows, returns.
    3. Agricultural recommendations: seasonal crops, nutrition, fair price comparisons.
    """
    user_context = user_context or {}
    marketplace_items = (marketplace_items or [])[:20]  # Ground with top active items
    order_history = (order_history or [])[:10]         # Ground with recent orders
    conv_history = (conversation_history or [])[-6:]    # Last 3-6 turns

    # Prepare compact marketplace inventory snapshot
    market_summary = []
    for p in marketplace_items:
        price_info = ""
        slabs = p.get("slabs", [])
        if slabs:
            price_info = f"₹{slabs[0].get('price_per_kg', 0)}/kg"
            if len(slabs) > 1:
                price_info += f" (Bulk slab: ₹{slabs[-1].get('price_per_kg', 0)}/kg for >{slabs[-1].get('min_quantity', 50)}kg)"
        else:
            price_info = f"₹{p.get('price_per_kg', 35)}/kg"

        market_summary.append({
            "id": p.get("id"),
            "name": p.get("name"),
            "category": p.get("category"),
            "variety": p.get("variety"),
            "grade": p.get("grade"),
            "price": price_info,
            "stock_kg": p.get("available_quantity"),
            "farmer": p.get("farmer_name"),
            "location": f"{p.get('farmer_district', '')}, {p.get('farmer_state', '')}".strip(", ")
        })

    # Prepare compact order history snapshot
    orders_summary = []
    for o in order_history:
        orders_summary.append({
            "order_number": o.get("order_number"),
            "product": o.get("product_name"),
            "quantity_kg": o.get("quantity"),
            "total_amount": f"₹{o.get('total_amount')}",
            "status": o.get("status"),
            "date": str(o.get("created_at", ""))[:10],
            "payment_status": o.get("payment_status", "pending"),
            "delivery_location": o.get("delivery_location", ""),
            "inspection_active": o.get("inspection_active", False)
        })

    system_instruction = (
        "You are KisanMitra AI, the official consumer assistant on the KisanSetu Agricultural Platform. "
        "KisanSetu connects consumers and bulk buyers directly with Indian farmers without exploitative middlemen. "
        "You provide warm, polite, highly helpful, and accurate answers in markdown format. "
        "Always rely strictly on the provided real-time 'MARKETPLACE_INVENTORY' and 'CONSUMER_ORDERS' when answering specific queries. "
        "When asked about orders, check the customer's orders and clearly report the order number, item, status, and total. "
        "When asked about available produce or prices, recommend matching items from the marketplace with farmer locations and prices. "
        "Keep answers concise, clear, and well-structured with bullet points where appropriate. "
        "Language instruction: Respond in the language specified in PREFERRED_LANGUAGE (e.g. English for 'en', Tamil for 'ta', Hindi for 'hi'), or in the language the user wrote in."
    )

    lang_code = user_context.get("language", "en")
    lang_name = "English" if lang_code == "en" else "Tamil" if lang_code == "ta" else "Hindi" if lang_code == "hi" else "English"

    prompt = f"""
    PREFERRED_LANGUAGE: {lang_name} ({lang_code})

    CURRENT CONSUMER:
    - Name: {user_context.get('name', 'Valued Customer')}
    - Delivery Location: {user_context.get('location', user_context.get('address', 'Chennai, Tamil Nadu'))}

    CONSUMER ORDERS (Recent):
    {json.dumps(orders_summary, indent=2, ensure_ascii=False) if orders_summary else "No active or past orders found for this consumer account."}

    LIVE MARKETPLACE INVENTORY:
    {json.dumps(market_summary, indent=2, ensure_ascii=False) if market_summary else "No live produce listings currently in the marketplace catalog."}

    RECENT CHAT TURNS:
    {json.dumps(conv_history, ensure_ascii=False)}

    NEW USER MESSAGE:
    "{message}"

    Return a valid JSON object with the following exact keys:
    - "reply": (string, friendly conversational response formatted with markdown bold, lists, and emojis)
    - "intent": (string, one of ["order_query", "marketplace_search", "pricing_query", "recommendation", "greeting", "general"])
    - "referenced_orders": (array of strings, e.g. ["ORD-1001"] if specific orders are mentioned in your reply, or empty array [])
    - "referenced_products": (array of integers or strings, product IDs or produce names mentioned, or empty array [])
    - "suggested_actions": (array of action objects with "type" and "label", e.g. [{{"type": "view_order", "label": "View Order #ORD-1001", "order_number": "ORD-1001"}}, {{"type": "add_to_cart", "label": "Add Tomato to Cart", "product_id": 1, "product_name": "Tomato"}}] or empty array [])
    """

    try:
        res = _call_gemini(prompt, system_instruction=system_instruction)
        return {
            "success": True,
            "source": "Google Gemini AI",
            "reply": res.get("reply", "I am here to help you browse KisanSetu farm produce and track your direct farmer orders."),
            "intent": res.get("intent", "general"),
            "referenced_orders": res.get("referenced_orders", []),
            "referenced_products": res.get("referenced_products", []),
            "suggested_actions": res.get("suggested_actions", [])
        }
    except Exception as err:
        print(f"[GeminiService] Consumer chat error: {err}")
        return {
            "success": False,
            "error": str(err),
            "source": "fallback_needed"
        }


