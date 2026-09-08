import os
import sys

# KisanSetu - Gunicorn Production Configuration for Render
# Render assigns a dynamic port via the PORT environment variable (default: 10000)
port = os.environ.get("PORT", "10000")
bind = f"0.0.0.0:{port}"

# Free instances have 512MB RAM. Using 1 worker with multi-threading avoids OOM
# and ensures fast startup within Render's port-scanning health check timeout.
workers = 1
threads = 4
timeout = 120

# Stream logs directly to stdout/stderr so they are instantly visible in Render logs
accesslog = "-"
errorlog = "-"
loglevel = "info"

print(f"--> [Gunicorn Config] Binding to 0.0.0.0:{port} with {workers} worker and {threads} threads", file=sys.stderr, flush=True)
