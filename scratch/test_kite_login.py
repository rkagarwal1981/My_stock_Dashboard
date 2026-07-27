import os
import sys
import pyotp
import time
from playwright.sync_api import sync_playwright

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pull_zerodha_trades import get_zerodha_credentials

def main():
    creds = get_zerodha_credentials()
    username = creds.get("username")
    password = creds.get("password")
    
    print(f"Testing login for {username}...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        page.goto("https://kite.zerodha.com/")
        page.wait_for_selector("input#userid")
        
        page.fill("input#userid", username)
        page.fill("input#password", password)
        
        # Take screenshot before clicking submit
        page.screenshot(path="kite_before_submit.png")
        print("Captured screenshot before submit.")
        
        page.click("button[type='submit']")
        print("Clicked submit. Waiting for transition...")
        
        # Wait 10 seconds and check URL
        time.sleep(10)
        print("Current URL:", page.url)
        
        # Take screenshot after submit
        page.screenshot(path="kite_after_submit.png")
        print("Captured screenshot after submit.")
        
        # Print all visible inputs
        inputs = page.locator("input").all()
        for idx, inp in enumerate(inputs):
            if inp.is_visible():
                print(f"Input {idx}: id={inp.get_attribute('id')}, type={inp.get_attribute('type')}, placeholder={inp.get_attribute('placeholder')}")
                
        browser.close()

if __name__ == "__main__":
    main()
