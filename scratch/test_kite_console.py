import os
import sys
import time
from playwright.sync_api import sync_playwright

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pull_zerodha_trades import COOKIE_PATH

def main():
    print("Testing Console Tradebook page loading...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context_args = {"accept_downloads": True}
        if os.path.exists(COOKIE_PATH):
            context_args["storage_state"] = COOKIE_PATH
            print("Loaded session cookies from:", COOKIE_PATH)
            
        context = browser.new_context(**context_args)
        page = context.new_page()
        
        print("Navigating to Console tradebook...")
        page.goto("https://console.zerodha.com/reports/tradebook")
        
        print("Waiting 10 seconds for page to fully render...")
        time.sleep(10)
        
        print("Current URL:", page.url)
        page.screenshot(path="console_tradebook.png")
        print("Captured screenshot to console_tradebook.png")
        
        # List all buttons, divs, inputs, selectors that might represent segments
        elements = page.locator("select, button, div.select, div[class*='select']").all()
        print(f"Found {len(elements)} potential interactive elements:")
        for idx, el in enumerate(elements[:30]): # Limit to first 30
            try:
                el_text = el.text_content().strip().replace('\n', ' ')[:80]
                el_id = el.get_attribute("id") or ""
                el_class = el.get_attribute("class") or ""
                print(f"El {idx}: text='{el_text}', id='{el_id}', class='{el_class}'")
            except Exception:
                pass
                
        browser.close()

if __name__ == "__main__":
    main()
