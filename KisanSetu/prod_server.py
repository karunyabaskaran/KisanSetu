"""
KisanSetu - Production WSGI Server
Runs high-concurrency multi-threaded Waitress WSGI server suitable for local network / enterprise deployment.
"""

import os
import sys
import logging
from waitress import serve
from app import app
from backend.db import init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    host = os.environ.get("HOST", "0.0.0.0")
    threads = int(os.environ.get("WEB_CONCURRENCY", 8))
    
    print("\n=======================================================")
    print(" [KisanSetu] - Production Agricultural Exchange Engine ")
    print(f" Serving on http://{host}:{port} ({threads} worker threads)")
    print(f" Local browser access: http://127.0.0.1:{port}")
    print("=======================================================\n")
    
    serve(app, host=host, port=port, threads=threads)
