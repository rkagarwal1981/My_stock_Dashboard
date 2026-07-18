import os
import sys
import threading
import asyncio
from playwright.sync_api import sync_playwright

def run_in_thread():
    print("Background thread started...")
    
    # 1. Set event loop
    if sys.platform == 'win32':
        loop = asyncio.ProactorEventLoop()
        asyncio.set_event_loop(loop)
        print("ProactorEventLoop set in thread.")
    
    try:
        with sync_playwright() as p:
            print("Launching browser...")
            browser = p.chromium.launch(headless=True)
            print("Browser launched successfully!")
            browser.close()
    except Exception as e:
        print("Playwright failed in thread:", e)
        import traceback
        traceback.print_exc()

t = threading.Thread(target=run_in_thread)
t.start()
t.join()
print("Main thread finished.")
