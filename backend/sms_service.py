"""
KisanSetu - SMS Gateway Integration Service
Supports:
1. Fast2SMS (India Quick Transactional / OTP SMS)
2. Twilio (Global SMS)
3. Console (Safe fallback logging for local development / testing)
"""

import os
import json
import urllib.request
import urllib.parse
import logging

logger = logging.getLogger("kisan_sms")
logging.basicConfig(level=logging.INFO)

APP_NAME = "KisanSetu"

def _clean_phone(phone):
    """Normalize phone number to 10-digit Indian standard if applicable."""
    cleaned = "".join(filter(str.isdigit, str(phone or "")))
    if len(cleaned) > 10 and cleaned.startswith("91"):
        cleaned = cleaned[2:]
    return cleaned

def send_via_fast2sms(phone, message):
    """
    Sends SMS via Fast2SMS Bulk V2 Quick SMS API.
    Fast2SMS provides instant Indian SMS routing.
    """
    api_key = os.environ.get("FAST2SMS_API_KEY")
    if not api_key:
        logger.warning("[Fast2SMS] Missing FAST2SMS_API_KEY environment variable. Falling back to console.")
        return send_via_console(phone, message)

    cleaned_phone = _clean_phone(phone)
    if len(cleaned_phone) != 10:
        logger.warning(f"[Fast2SMS] Invalid phone number length: {cleaned_phone}")
        return {"success": False, "error": "Invalid 10-digit mobile number"}

    url = "https://www.fast2sms.com/dev/bulkV2"
    payload = {
        "route": "q",  # Quick transactional route
        "message": message,
        "language": "english",
        "flash": 0,
        "numbers": cleaned_phone
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "authorization": api_key,
                "Content-Type": "application/json",
                "User-Agent": "KisanSetu-SMS/1.0"
            }
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            logger.info(f"[Fast2SMS] Sent to {cleaned_phone}: {data.get('message', 'OK')}")
            return {"success": True, "provider": "fast2sms", "data": data}
    except Exception as err:
        logger.error(f"[Fast2SMS] Failed to send SMS to {cleaned_phone}: {err}")
        return {"success": False, "provider": "fast2sms", "error": str(err)}

def send_via_twilio(phone, message):
    """Sends SMS via Twilio REST API."""
    account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_number = os.environ.get("TWILIO_FROM_NUMBER")

    if not (account_sid and auth_token and from_number):
        logger.warning("[Twilio] Missing Twilio credentials. Falling back to console.")
        return send_via_console(phone, message)

    to_number = phone if str(phone).startswith("+") else f"+91{_clean_phone(phone)}"
    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    data = urllib.parse.urlencode({
        "To": to_number,
        "From": from_number,
        "Body": message
    }).encode("utf-8")

    try:
        import base64
        auth_header = "Basic " + base64.b64encode(f"{account_sid}:{auth_token}".encode("utf-8")).decode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Authorization": auth_header})
        with urllib.request.urlopen(req, timeout=10) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
            logger.info(f"[Twilio] Dispatched to {to_number}, sid: {res_data.get('sid')}")
            return {"success": True, "provider": "twilio", "sid": res_data.get("sid")}
    except urllib.error.HTTPError as http_err:
        try:
            err_body = json.loads(http_err.read().decode("utf-8"))
            err_msg = f"Twilio Error {err_body.get('code')}: {err_body.get('message')}"
        except Exception:
            err_msg = str(http_err)
        logger.error(f"[Twilio] HTTP error sending to {to_number}: {err_msg}")
        return {"success": False, "provider": "twilio", "error": err_msg}
    except Exception as err:
        logger.error(f"[Twilio] Error dispatching to {to_number}: {err}")
        return {"success": False, "provider": "twilio", "error": str(err)}

def send_via_console(phone, message):
    """Outputs SMS to application logs for zero-setup demo & local debugging."""
    print(f"\n================= [SMS DISPATCH] =================")
    print(f"To     : +91-{_clean_phone(phone)}")
    print(f"Message: {message}")
    print(f"==================================================\n")
    return {"success": True, "provider": "console", "delivered": True}

def send_sms(phone, message):
    """Main entry point to dispatch SMS based on environment configuration."""
    provider = (os.environ.get("SMS_PROVIDER") or "console").strip().lower()
    if provider == "fast2sms":
        return send_via_fast2sms(phone, message)
    elif provider == "twilio":
        return send_via_twilio(phone, message)
    else:
        return send_via_console(phone, message)

# ----------------- Specialized Business Triggers -----------------

def send_otp_sms(mobile, otp, role="user"):
    """Triggers OTP SMS for Buyer / Farmer registration & sign-in."""
    role_label = "Farmer" if role == "farmer" else ("Consumer" if role == "buyer" else "Account")
    message = f"{APP_NAME}: Your {role_label} verification OTP is {otp}. Valid for 10 minutes. Do not share this OTP with anyone."
    return send_sms(mobile, message)

def send_farmer_approval_sms(mobile, farmer_name, approved, reason=None):
    """Notifies farmer regarding Ministry administrator registration review."""
    if approved:
        message = (
            f"{APP_NAME}: Hello {farmer_name}, your Farmer registration application has been APPROVED by the Ministry of Agriculture. "
            f"You can now log in to the KisanSetu portal with your mobile and password to list your produce."
        )
    else:
        reason_text = f" Reason for rejection: {reason}." if reason else " Reason: Application review criteria not met."
        message = (
            f"{APP_NAME}: Hello {farmer_name}, your Farmer registration application has been REJECTED by the Ministry of Agriculture.{reason_text} "
            f"Please update your details and re-apply or contact Ministry support."
        )
    return send_sms(mobile, message)

def send_order_confirmation_sms(buyer_mobile, buyer_name, order_number, crop_name, quantity, total_amount):
    """Notifies buyer upon order placement."""
    message = f"{APP_NAME}: Order {order_number} confirmed! {quantity}kg of {crop_name} for Rs {total_amount:.2f}. Track your order on KisanSetu."
    return send_sms(buyer_mobile, message)

def send_farmer_new_order_sms(farmer_mobile, farmer_name, order_number, crop_name, quantity, total_amount):
    """Notifies farmer upon receiving a new direct order."""
    message = f"{APP_NAME}: Namaste {farmer_name}! New order {order_number} received for {quantity}kg of {crop_name} (Rs {total_amount:.2f}). Check your farmer dashboard."
    return send_sms(farmer_mobile, message)

def send_order_status_sms(buyer_mobile, order_number, status):
    """Notifies buyer when order lifecycle status progresses."""
    status_clean = str(status).replace("_", " ").title()
    message = f"{APP_NAME}: Update on order {order_number} - Status changed to '{status_clean}'."
    return send_sms(buyer_mobile, message)
