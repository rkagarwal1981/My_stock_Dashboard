from playwright.sync_api import sync_playwright
import time

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        print("Navigating to kite.zerodha.com...")
        page.goto("https://kite.zerodha.com/")
        time.sleep(5)
        
        # Take screenshot
        screenshot_path = "kite_login_page.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")
        
        # Print input fields
        inputs = page.locator("input").all()
        print(f"Found {len(inputs)} input elements:")
        for idx, inp in enumerate(inputs):
            print(f"Input {idx}: id={inp.get_attribute('id')}, type={inp.get_attribute('type')}, visible={inp.is_visible()}")
            
        browser.close()

if __name__ == "__main__":
    main()
