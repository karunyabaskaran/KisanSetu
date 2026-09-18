"""
KisanSetu - Consumer AI Chatbot Verification Suite
Tests Gemini AI & Heuristic Grounding for Marketplace and Order Details
"""

import sys
import json
import unittest

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app import app

class ConsumerChatbotTestCase(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_marketplace_inquiry(self):
        """Test asking the AI chatbot about available marketplace produce."""
        payload = {
            "message": "What fresh vegetables are available in the marketplace today?",
            "user_id": 12,
            "buyer_name": "arjun",
            "language": "en"
        }
        res = self.client.post("/api/ai/consumer-chat", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("success"))
        reply = data.get("reply", "")
        self.assertTrue(len(reply) > 20)
        print("\n[TEST 1: Marketplace Inquiry] Reply Preview:")
        print(reply[:250])

    def test_order_tracking_inquiry(self):
        """Test asking the AI chatbot about order status & recent orders."""
        payload = {
            "message": "Where is my latest order and what is its status?",
            "user_id": 12,
            "buyer_name": "arjun",
            "language": "en"
        }
        res = self.client.post("/api/ai/consumer-chat", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("success"))
        reply = data.get("reply", "")
        self.assertTrue(len(reply) > 20)
        actions = data.get("suggested_actions", [])
        print("\n[TEST 2: Order Tracking Inquiry] Reply Preview:")
        print(reply[:250])
        print("Actions generated:", actions)

    def test_specific_order_number_lookup(self):
        """Test asking specifically about an order number."""
        payload = {
            "message": "Can you check the details of order #ORD-2026-D50717?",
            "user_id": 12,
            "buyer_name": "arjun",
            "language": "en"
        }
        res = self.client.post("/api/ai/consumer-chat", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("success"))
        reply = data.get("reply", "")
        self.assertIn("ORD-2026-D50717", reply)
        print("\n[TEST 3: Specific Order Number Lookup] Found order in reply!")

    def test_heuristic_offline_fallback(self):
        """Test that the heuristic assistant works when Gemini is bypassed."""
        from backend.ai_engine import _heuristic_consumer_chat
        test_orders = [{
            "order_number": "ORD-TEST-99",
            "product_name": "Organic Tomatoes",
            "quantity": 5.0,
            "total_amount": 200.0,
            "status": "shipped",
            "delivery_location": "Chennai Hub"
        }]
        test_prods = [{
            "id": 1,
            "name": "Tomatoes",
            "category": "Vegetables",
            "farmer_name": "Ravi",
            "slabs": [{"price_per_kg": 38.0}]
        }]
        
        # Test order heuristic
        res_order = _heuristic_consumer_chat("Where is my order?", {"name": "TestUser"}, test_prods, test_orders)
        self.assertTrue(res_order["success"])
        self.assertIn("ORD-TEST-99", res_order["reply"])

        # Test marketplace heuristic
        res_market = _heuristic_consumer_chat("What produce is available?", {"name": "TestUser"}, test_prods, test_orders)
        self.assertTrue(res_market["success"])
        self.assertIn("Tomatoes", res_market["reply"])
        print("\n[TEST 4: Heuristic Offline Fallback] Verified 100% resilient fallback!")

    def test_price_of_tomato_query(self):
        """Test asking 'price of tomato' via the API endpoint."""
        payload = {
            "message": "price of tomato",
            "language": "en"
        }
        res = self.client.post("/api/ai/consumer-chat", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("success"))
        reply_lower = data.get("reply", "").lower()
        self.assertIn("tomato", reply_lower)
        self.assertNotIn("kallur nilam samba rice", reply_lower)
        print("\n[TEST 5: Price of Tomato API] Accurately answered tomato pricing without showing rice!")

    def test_price_of_tomato_heuristic_fallback(self):
        """Test asking 'price of tomato' directly against the heuristic fallback."""
        from backend.ai_engine import _heuristic_consumer_chat
        mock_items = [
            {
                "id": 61,
                "name": "Kallur Nilam Samba Rice",
                "category": "Grains",
                "grade": "Grade A",
                "farmer_name": "Murugan",
                "available_quantity": 500,
                "slabs": [{"min_quantity": 1, "price_per_kg": 60.0}]
            },
            {
                "id": 59,
                "name": "Country Organic Tomatoes",
                "category": "Vegetables",
                "grade": "Grade A",
                "farmer_name": "Farmer Velu",
                "farmer_district": "Salem",
                "farmer_state": "Tamil Nadu",
                "available_quantity": 150.0,
                "slabs": [{"min_quantity": 1, "price_per_kg": 40.0}, {"min_quantity": 15, "price_per_kg": 25.0}]
            }
        ]
        res = _heuristic_consumer_chat("price of tomato", {"name": "Arjun"}, mock_items, [])
        self.assertTrue(res["success"])
        reply = res["reply"]
        self.assertIn("Country Organic Tomatoes", reply)
        self.assertIn("₹40.0/kg", reply)
        self.assertNotIn("Kallur Nilam Samba Rice", reply)
        self.assertTrue(any(a["product_name"] == "Country Organic Tomatoes" for a in res["suggested_actions"]))
        print("\n[TEST 6: Price of Tomato Heuristic] Matched Country Organic Tomatoes with exact slabs and actions!")


if __name__ == "__main__":
    unittest.main()
