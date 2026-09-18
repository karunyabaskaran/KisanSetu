"""
KisanSetu - India State-Wise Crop Knowledge Engine
================================================================================
Parses and provides localized crop intelligence from `india-crops-statewise.md`:
- Comprehensive data across 157+ Indian fruits, vegetables, rice types, millets,
  pulses, and spices.
- Major growing states mapping per crop.
- September 2026 indicative retail price benchmarks.
- State-specific cultivation recognition (identifying if the farmer is in a 
  leading producing hub vs a consuming state).
================================================================================
"""

import os
import re
import json

_KNOWLEDGE_CACHE = None

def _load_crop_database():
    global _KNOWLEDGE_CACHE
    if _KNOWLEDGE_CACHE is not None:
        return _KNOWLEDGE_CACHE

    md_path = os.path.join(os.path.dirname(__file__), "..", "india-crops-statewise.md")
    if not os.path.exists(md_path):
        md_path = os.path.join(os.path.dirname(__file__), "india-crops-statewise.md")
    if not os.path.exists(md_path):
        md_path = "india-crops-statewise.md"

    crops = []
    category = "Vegetables"

    alias_map = {
        "aloo": "Potato",
        "batata": "Potato",
        "pyaz": "Onion",
        "vengayam": "Onion",
        "kanda": "Onion",
        "thakkali": "Tomato",
        "tamatar": "Tomato",
        "bhindi": "Okra (Bhindi/Ladyfinger)",
        "ladyfinger": "Okra (Bhindi/Ladyfinger)",
        "ladies finger": "Okra (Bhindi/Ladyfinger)",
        "baingan": "Brinjal (Eggplant)",
        "kathirikai": "Brinjal (Eggplant)",
        "eggplant": "Brinjal (Eggplant)",
        "gajar": "Carrot",
        "beetroot": "Beetroot",
        "mooli": "Radish",
        "mullangi": "Radish",
        "matar": "Peas (Green)",
        "pattani": "Peas (Green)",
        "lauki": "Bottle Gourd (Lauki)",
        "sorakkai": "Bottle Gourd (Lauki)",
        "karela": "Bitter Gourd (Karela)",
        "pavakkai": "Bitter Gourd (Karela)",
        "turai": "Ridge Gourd (Turai)",
        "peerkangai": "Ridge Gourd (Turai)",
        "pudalangai": "Snake Gourd",
        "parangikai": "Pumpkin",
        "kaddu": "Pumpkin",
        "murungakkai": "Drumstick (Moringa)",
        "moringa": "Drumstick (Moringa)",
        "palak": "Spinach (Palak)",
        "keerai": "Spinach (Palak)",
        "methi": "Fenugreek Leaves (Methi)",
        "vendhaya keerai": "Fenugreek Leaves (Methi)",
        "adrak": "Ginger",
        "inji": "Ginger",
        "lehsun": "Garlic",
        "poondu": "Garlic",
        "chinna vengayam": "Shallot (Small Onion)",
        "small onion": "Shallot (Small Onion)",
        "shallot": "Shallot (Small Onion)",
        "kothavarangai": "Cluster Beans (Guar)",
        "guar": "Cluster Beans (Guar)",
        "beans": "Green Beans (French Beans)",
        "french beans": "Green Beans (French Beans)",
        "kheera": "Cucumber",
        "vellarikka": "Cucumber",
        "mirchi": "Green Chilli",
        "pachai milagai": "Green Chilli",
        "shimla mirch": "Capsicum (Bell Pepper)",
        "bell pepper": "Capsicum (Bell Pepper)",
        "koda milagai": "Capsicum (Bell Pepper)",
        "tur dal": "Pigeon Pea (Arhar/Tur Dal)",
        "toor dal": "Pigeon Pea (Arhar/Tur Dal)",
        "arhar": "Pigeon Pea (Arhar/Tur Dal)",
        "thuvaram paruppu": "Pigeon Pea (Arhar/Tur Dal)",
        "urad dal": "Black Gram (Urad Dal)",
        "ulutham paruppu": "Black Gram (Urad Dal)",
        "moong dal": "Green Gram (Moong Dal)",
        "pasi paruppu": "Green Gram (Moong Dal)",
        "chana dal": "Chickpea (Chana/Bengal Gram)",
        "chana": "Chickpea (Chana/Bengal Gram)",
        "bengal gram": "Chickpea (Chana/Bengal Gram)",
        "kondakadalai": "Chickpea (Chana/Bengal Gram)",
        "masoor dal": "Lentil (Masoor Dal)",
        "rajma": "Kidney Beans (Rajma)",
        "horse gram": "Horse Gram (Kulthi)",
        "kollu": "Horse Gram (Kulthi)",
        "gehun": "Wheat",
        "godhumai": "Wheat",
        "makka cholam": "Maize (Corn)",
        "makka": "Maize (Corn)",
        "corn": "Maize (Corn)",
        "cholam": "Jowar (Sorghum)",
        "kambu": "Bajra (Pearl Millet)",
        "kelvaragu": "Ragi (Finger Millet)",
        "finger millet": "Ragi (Finger Millet)",
        "ragi": "Ragi (Finger Millet)",
        "ponni": "Ponni Rice",
        "sona masoori": "Parboiled (Sona Masoori, Idli rice etc.)",
        "basmati": "Basmati Rice",
        "paddy": "Non-Basmati (common/raw)",
        "arisi": "Non-Basmati (common/raw)",
        "rice": "Non-Basmati (common/raw)",
        "kela": "Banana",
        "vazhaipazham": "Banana",
        "aam": "Mango",
        "maambazham": "Mango",
        "angoor": "Grapes",
        "thiratchai": "Grapes",
        "seb": "Apple",
        "anaar": "Pomegranate",
        "maadhulai": "Pomegranate",
        "tarbooj": "Watermelon",
        "tharpoosani": "Watermelon",
        "mosambi": "Citrus – Sweet Lime (Mosambi)",
        "sweet lime": "Citrus – Sweet Lime (Mosambi)",
        "orange": "Citrus – Orange",
        "kinnow": "Citrus – Mandarin/Kinnow",
        "lemon": "Lemon",
        "elamichai": "Lemon",
        "nimbu": "Lemon",
        "haldi": "Turmeric",
        "manjal": "Turmeric",
        "milagu": "Black Pepper",
        "kali mirch": "Black Pepper",
        "pepper": "Black Pepper",
        "elakkai": "Cardamom (Green)",
        "elaichi": "Cardamom (Green)",
        "cardamom": "Cardamom (Green)",
        "jeera": "Cumin (Jeera)",
        "seeragam": "Cumin (Jeera)",
        "cumin": "Cumin (Jeera)",
        "dhania": "Coriander Seed",
        "kothamalli": "Coriander Leaves",
        "saunf": "Fennel (Saunf)",
        "sombu": "Fennel (Saunf)",
        "mustard": "Mustard Seed",
        "kadugu": "Mustard Seed",
        "clove": "Clove",
        "laung": "Clove",
        "kirambu": "Clove",
        "cinnamon": "Cinnamon",
        "dalchini": "Cinnamon",
        "pattai": "Cinnamon",
        "pudina": "Mint (Pudina)",
        "curry leaves": "Curry Leaves",
        "karuveppilai": "Curry Leaves",
        "tamarind": "Tamarind",
        "puli": "Tamarind",
        "imli": "Tamarind"
    }

    if os.path.exists(md_path):
        try:
            with open(md_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
            for line in lines:
                if line.startswith("## "):
                    raw_cat = re.sub(r'^\d+\.\s*', '', line.replace("## ", "").strip().split("(")[0].strip())
                    category = raw_cat.title()
                elif "|" in line and not line.startswith("|---") and not any(k in line for k in ["| Fruit", "| Vegetable", "| Rice Type", "| Crop", "| Pulse", "| Spice", "| Herb"]):
                    parts = [p.strip() for p in line.split("|")[1:-1]]
                    if len(parts) >= 3 and parts[0]:
                        name, states_raw, price_raw = parts[0], parts[1], parts[2]
                        
                        # Parse price range
                        p_min, p_max = None, None
                        if price_raw and price_raw.strip() not in ["—", "-", ""]:
                            m = re.search(r'(\d+)\s*[–-]\s*(\d+)', price_raw)
                            if m:
                                p_min, p_max = float(m.group(1)), float(m.group(2))
                            else:
                                m_s = re.search(r'(\d+)', price_raw)
                                if m_s:
                                    p_min = p_max = float(m_s.group(1))

                        # Clean states
                        state_tokens = []
                        for s in re.split(r'[,/]', states_raw):
                            clean_s = re.sub(r'\(.*?\)', '', s).strip()
                            if clean_s and len(clean_s) > 2:
                                state_tokens.append(clean_s)

                        crops.append({
                            "name": name,
                            "category": category,
                            "states_raw": states_raw,
                            "major_states": state_tokens,
                            "price_raw": price_raw,
                            "price_min": p_min,
                            "price_max": p_max
                        })
        except Exception as e:
            print(f"[CropKnowledge] Error loading markdown: {e}")

    _KNOWLEDGE_CACHE = {
        "crops": crops,
        "aliases": alias_map
    }
    return _KNOWLEDGE_CACHE

def normalize_text(text: str) -> str:
    if not text:
        return ""
    return re.sub(r'[^a-zA-Z0-9\s]', ' ', text.lower()).strip()

def lookup_crop_knowledge(crop_query: str, region_query: str = "") -> dict:
    """
    Looks up state-wise cultivation data and September 2026 indicative pricing
    for any entered crop and farmer region.
    """
    db = _load_crop_database()
    crops = db["crops"]
    aliases = db["aliases"]

    query_clean = normalize_text(crop_query)
    region_clean = normalize_text(region_query)

    # 1. Direct alias resolution
    canonical_alias = None
    for alias_key, target in aliases.items():
        if alias_key in query_clean or query_clean in alias_key:
            canonical_alias = target
            break

    # 2. Find crop entry in database
    matched_crop = None
    if canonical_alias:
        for c in crops:
            if c["name"].lower() == canonical_alias.lower():
                matched_crop = c
                break

    # 3. Exact word boundary match in crop name (e.g. "apple" must match "Apple", not "Pineapple")
    if not matched_crop:
        for c in crops:
            c_norm = normalize_text(c["name"])
            pattern = rf'\b{re.escape(query_clean)}\b'
            if re.search(pattern, c_norm):
                matched_crop = c
                break

    # 4. Exact full name match
    if not matched_crop:
        for c in crops:
            c_norm = normalize_text(c["name"])
            if query_clean == c_norm:
                matched_crop = c
                break

    # 5. Substring match
    if not matched_crop:
        for c in crops:
            c_norm = normalize_text(c["name"])
            if query_clean in c_norm or c_norm in query_clean:
                matched_crop = c
                break

    if not matched_crop:
        # Token-level overlap matching
        q_tokens = set(query_clean.split())
        best_overlap = 0
        for c in crops:
            c_tokens = set(normalize_text(c["name"]).split())
            overlap = len(q_tokens & c_tokens)
            if overlap > best_overlap:
                best_overlap = overlap
                matched_crop = c

    if not matched_crop:
        return {
            "found": False,
            "commodity": crop_query,
            "category": "Vegetables",
            "is_major_producer": False,
            "state_insight": f"Cultivated across regional agricultural clusters in {region_query}."
        }

    # Analyze state cultivation relationship
    is_major_producer = False
    matched_state = None
    for st in matched_crop["major_states"]:
        st_norm = normalize_text(st)
        if st_norm and (st_norm in region_clean or region_clean in st_norm):
            is_major_producer = True
            matched_state = st
            break

    p_min = matched_crop["price_min"]
    p_max = matched_crop["price_max"]

    # Compute realistic local vendor retail reference and direct farm-gate discount
    if p_min is not None and p_max is not None:
        if is_major_producer:
            # When produced locally in the farmer's state, local retail is in the lower-mid range
            local_vendor_ref = round(p_min + (p_max - p_min) * 0.35, 1)
        else:
            # When imported from other states, retail price reflects long-distance transit markups
            local_vendor_ref = round(p_max, 1)
        
        # Farm-gate price is strictly 18-22% lower than local vendors (eliminating middleman commission)
        suggested_retail = round(local_vendor_ref * 0.80, 1)
        suggested_bulk = round(suggested_retail * 0.82, 1)
    else:
        local_vendor_ref = None
        suggested_retail = None
        suggested_bulk = None

    # State cultivation narrative
    primary_states = ", ".join(matched_crop["major_states"][:4]) if matched_crop["major_states"] else "various Indian states"
    if is_major_producer:
        state_insight = (
            f"{matched_state} is one of India's leading producers of {matched_crop['name']} ({matched_crop['states_raw']}). "
            f"Selling farm-gate direct eliminates commission agents and captures high fresh-harvest value."
        )
    else:
        state_insight = (
            f"{matched_crop['name']} is primarily cultivated in {primary_states}. "
            f"Direct sourcing in {region_query} provides significant savings over long-distance transit markups."
        )

    return {
        "found": True,
        "canonical_name": matched_crop["name"],
        "category": matched_crop["category"],
        "major_states": matched_crop["major_states"],
        "is_major_producer": is_major_producer,
        "matched_state": matched_state,
        "indicative_price_range": (p_min, p_max),
        "indicative_price_str": matched_crop["price_raw"],
        "local_vendor_reference": local_vendor_ref,
        "suggested_retail": suggested_retail,
        "suggested_bulk": suggested_bulk,
        "state_insight": state_insight
    }

def get_all_cultivated_commodities():
    """Returns sorted list of all crops from the state-wise guide for autocomplete."""
    db = _load_crop_database()
    return [c["name"] for c in db["crops"]]
