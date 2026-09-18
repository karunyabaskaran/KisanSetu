"""
KisanSetu - Farmer & Buyer OTP Login & Verification Suite
"""

import sys
import json
import unittest

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app import app

class OTPAuthTestCase(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_farmer_otp_generation_and_login(self):
        """Test sending OTP and logging in via OTP for Farmer."""
        mobile = "9840123456"  # Existing farmer in DB (Murugan Raman)
        
        # 1. Send OTP
        res_send = self.client.post("/api/auth/send-otp", json={"mobile": mobile, "role": "farmer"})
        self.assertEqual(res_send.status_code, 200)
        data_send = res_send.get_json()
        self.assertTrue(data_send.get("success"))
        otp = data_send.get("otp") or data_send.get("test_otp")
        self.assertTrue(otp and len(otp) == 6)
        print(f"\n[FARMER OTP] Generated OTP for +91-{mobile}: {otp}")

        # 2. Verify OTP
        res_verify = self.client.post("/api/auth/verify-otp", json={"mobile": mobile, "otp": otp})
        self.assertEqual(res_verify.status_code, 200)
        self.assertTrue(res_verify.get_json().get("success"))

        # 3. Login via OTP
        res_login = self.client.post("/api/auth/login-otp", json={"mobile": mobile, "otp": otp, "role": "farmer"})
        self.assertEqual(res_login.status_code, 200)
        login_data = res_login.get_json()
        self.assertTrue(login_data.get("success"))
        self.assertEqual(login_data["user"]["role"], "farmer")
        print(f"[FARMER LOGIN] Successfully logged in Farmer: {login_data['user']['name']}")

    def test_buyer_otp_generation_and_login(self):
        """Test sending OTP and logging in via OTP for Buyer/Consumer."""
        mobile = "9884123456"  # Existing buyer in DB (arjun)
        
        # 1. Send OTP
        res_send = self.client.post("/api/auth/send-otp", json={"mobile": mobile, "role": "buyer"})
        self.assertEqual(res_send.status_code, 200)
        data_send = res_send.get_json()
        self.assertTrue(data_send.get("success"))
        otp = data_send.get("otp") or data_send.get("test_otp")
        self.assertTrue(otp and len(otp) == 6)
        print(f"\n[BUYER OTP] Generated OTP for +91-{mobile}: {otp}")

        # 2. Login via OTP
        res_login = self.client.post("/api/auth/login-otp", json={"mobile": mobile, "otp": otp, "role": "buyer"})
        self.assertEqual(res_login.status_code, 200)
        login_data = res_login.get_json()
        self.assertTrue(login_data.get("success"))
        self.assertEqual(login_data["user"]["role"], "buyer")
        print(f"[BUYER LOGIN] Successfully logged in Buyer: {login_data['user']['name']}")

    def test_invalid_otp_rejection(self):
        """Test that invalid OTP codes are rejected properly."""
        res_bad = self.client.post("/api/auth/login-otp", json={"mobile": "9884123456", "otp": "000000", "role": "buyer"})
        self.assertEqual(res_bad.status_code, 400)
        self.assertFalse(res_bad.get_json().get("success"))
        print("\n[SECURITY] Invalid OTP code successfully rejected.")

if __name__ == "__main__":
    unittest.main()
