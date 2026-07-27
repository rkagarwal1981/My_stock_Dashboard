import os
import sys
import time
from playwright.sync_api import sync_playwright

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pull_zerodha_trades import get_zerodha_credentials, COOKIE_PATH

def main():
    creds = get_zerodha_credentials()
    username = creds.get("username")
    
    print("Testing Console redirect flow...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context_args = {"accept_downloads": True}
        if os.path.exists(COOKIE_PATH):
            context_args["storage_state"] = COOKIE_PATH
            print("Loaded session cookies from:", COOKIE_PATH)
            
        context = browser.new_context(**context_args)
        page = context.new_page()
        
        print("Navigating directly to Console tradebook...")
        page.goto("https://console.zerodha.com/reports/tradebook")
        
        print("Waiting 5 seconds for page load & redirects to settle...")
        time.sleep(5)
        
        print("Current URL:", page.url)
        page.screenshot(path="kite_redirect_page.png")
        print("Captured screenshot to kite_redirect_page.png")
        
        # Check inputs
        inputs = page.locator("input").all()
        print(f"Found {len(inputs)} input elements:")
        for idx, inp in enumerate(inputs):
            print(f"Input {idx}: id={inp.get_attribute('id')}, type={inp.get_attribute('type')}, visible={inp.is_visible()}")
            
        browser.close()

if __name__ == "__main__":
    main()
