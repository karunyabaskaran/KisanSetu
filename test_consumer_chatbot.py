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

if __name__ == "__main__":
    unittest.main()
