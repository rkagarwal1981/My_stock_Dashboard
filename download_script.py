import re
import os
import pyotp
import time
from playwright.sync_api import Playwright, sync_playwright, expect


def run(playwright: Playwright) -> None:
    username = "9910100289"
    password = "Rsharda@85"
    session_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mstock_session.json")

    browser = playwright.chromium.launch(headless=False, args=["--disable-web-security"])
    
    context_args = {}
    if os.path.exists(session_path):
        print("Restoring session from mstock_session.json...")
        context_args["storage_state"] = session_path
        
    context = browser.new_context(**context_args)
    page = context.new_page()
    
    # Listen to console and page errors safely (preventing UnicodeEncodeError on Windows console)
    page.on("console", lambda msg: print(f"[Browser Console] {msg.text.encode('ascii', errors='replace').decode('ascii')}"))
    page.on("pageerror", lambda err: print(f"[Browser Page Error] {str(err).encode('ascii', errors='replace').decode('ascii')}"))

    # Navigate to login (or dashboard if session is restored)
    page.goto("https://trade.mstock.com/#/login")
    time.sleep(3)
    
    # Check if login is required
    is_login = "login" in page.url or page.locator("input[placeholder*='User ID']").is_visible() or page.locator("input[placeholder*='Mobile Number']").is_visible() or page.get_by_role("button", name="Login with Credentials").is_visible()
    
    if is_login:
        print("Not logged in. Proceeding with login flow...")
        page.get_by_role("button", name="Login with Credentials").click()
        page.get_by_role("textbox", name="Enter Mobile Number / Client").fill(username)
        page.get_by_role("textbox", name="Enter Mobile Number / Client").press("Tab")
        page.get_by_role("textbox", name="Enter Password").fill(password)
        page.get_by_role("button", name="Login").click()
        # Wait for the OTP/TOTP page to load
        page.wait_for_selector("input", timeout=15000)

        # Dismiss modal popup "Please enter the OTP & click on Submit" if it appears
        try:
            time.sleep(2)
            close_btn = page.locator("button:has-text('Close')").first
            if close_btn.is_visible():
                print("Dismissing informational Close popup...")
                close_btn.click()
                time.sleep(1)
        except Exception as e:
            print(f"No Close button to click or click failed: {e}")
        
        # Prompt the user for the OTP code in the terminal
        otp = input("Please enter the 6-digit OTP/TOTP code: ").strip()
        while len(otp) != 6 or not otp.isdigit():
            otp = input("Invalid input. Please enter exactly 6 digits: ").strip()
        
        # Fill the OTP boxes digit-by-digit
        try:
            otp_fields = page.locator("input[type='tel']").all()
            if len(otp_fields) == 6:
                for idx, digit in enumerate(otp):
                    otp_fields[idx].fill(digit)
            else:
                for idx, digit in enumerate(otp):
                    page.get_by_role("textbox").nth(idx).fill(digit)
        except Exception as e:
            print(f"Failed filling digit-by-digit: {e}")
            try:
                page.locator("input[placeholder*='OTP']").first.fill(otp)
            except Exception:
                raise e

        # Press Enter to submit the form
        page.keyboard.press("Enter")
        time.sleep(2)

        # Click Submit / Verify / Login button if visible
        try:
            submit_btn = page.locator("button:has-text('Submit'), button:has-text('Verify'), button:has-text('Login'), .btn-primary").first
            if submit_btn.is_visible():
                submit_btn.click()
                time.sleep(2)
        except Exception as e:
            print(f"Optional submit button click failed: {e}")
    else:
        print("Successfully restored session! Skipping login flow.")

    # Wait a bit for the dashboard to settle and handle any blocking popup modal
    time.sleep(3)
    try:
        close_btn = page.locator("button:has-text('Close')").first
        if close_btn.is_visible():
            print("Dismissing Close popup on dashboard page...")
            close_btn.click()
            time.sleep(1)
    except Exception as e:
        print(f"No Close button to click on dashboard page: {e}")

    try:
        page.get_by_role("button", name="Hamburger Menu").click(timeout=30000)
        # Save the session storage state after a successful navigation to Hamburger Menu
        try:
            context.storage_state(path=session_path)
            print(f"Saved session state to {session_path}")
        except Exception as e:
            print(f"Failed to save session state: {e}")
    except Exception as e:
        screenshot_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "download_script_failed.png")
        page.screenshot(path=screenshot_path)
        print(f"Failed waiting for Hamburger Menu. Saved screenshot to {screenshot_path}")
        raise e
    page.locator("a").filter(has_text="Ledger").click()
    page.get_by_role("tab", name="Current F.Y.").click()
    page.get_by_role("button", name="Download").click()
    
    # Download Ledger Excel
    with page.expect_download() as download_info:
        page.get_by_role("button", name="EXCEL").click()
    download = download_info.value
    
    expense_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Manual Data", "Expense")
    os.makedirs(expense_dir, exist_ok=True)
    
    ledger_path = os.path.join(expense_dir, "MA108170_Ledger_Report (26-27).xlsx")
    download.save_as(ledger_path)
    print(f"Saved Ledger to: {ledger_path}")
    
    try:
        page.get_by_role("button", name="Close").first.click()
        page.get_by_role("tab", name="P/L Report").click()
        page.get_by_role("tab", name="Tax P/L").click()
        
        # Select FY 2026-2027
        page.locator(".mat-mdc-select-arrow-wrapper").first.click()
        page.wait_for_selector("mat-option", timeout=5000)
        try:
            page.locator("mat-option").filter(has_text="-2027").click()
        except Exception:
            page.locator("#mat-option-1").get_by_text("-2027").click()
        time.sleep(1)
        
        page.get_by_role("button", name="Submit").click()
        time.sleep(2)
        
        page.get_by_role("button", name="Download").click()
        time.sleep(1)
        # Debug: log all elements containing "EXCEL"
        print("--- Debug: Elements containing 'EXCEL' ---")
        try:
            elements = page.locator("*:has-text('EXCEL')").all()
            for idx, el in enumerate(elements):
                try:
                    tag = el.evaluate("el => el.tagName")
                    is_vis = el.is_visible()
                    box = el.bounding_box()
                    html = el.evaluate("el => el.outerHTML")[:150]
                    print(f"El {idx}: Tag={tag}, Visible={is_vis}, Box={box}, HTML={html}")
                except Exception as inner_e:
                    print(f"El {idx} inner error: {inner_e}")
        except Exception as outer_e:
            print(f"Outer debug error: {outer_e}")
        print("------------------------------------------")

        # Download Tax P&L Excel
        with page.expect_download(timeout=60000) as download1_info:
            excel_btn = page.locator("button.excellBtn:visible").first
            if not excel_btn.is_visible():
                excel_btn = page.locator("button:visible:has-text('EXCEL')").first
            
            # Print outer HTML for confirmation
            try:
                print(f"Clicking Excel button: {excel_btn.evaluate('el => el.outerHTML')}")
            except Exception:
                pass
            
            # Try Playwright click first with force=True, then fallback to JS click
            try:
                excel_btn.click(force=True, timeout=10000)
                print("Clicked Excel button via Playwright click (force=True)")
            except Exception as click_err:
                print(f"Playwright click failed, trying native JS click fallback: {click_err}")
                try:
                    excel_btn.evaluate("el => el.click()")
                    print("Clicked Excel button via native JS click")
                except Exception as js_err:
                    print(f"Native JS click failed: {js_err}")
                    raise click_err
        download1 = download1_info.value
        
        tax_pnl_path = os.path.join(expense_dir, "Tax_PNL_Mstock (26-27).xlsx")
        download1.save_as(tax_pnl_path)
        print(f"Saved Tax P&L to: {tax_pnl_path}")
    except Exception as e:
        screenshot_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tax_pnl_failed.png")
        page.screenshot(path=screenshot_path)
        print(f"Failed during Tax P&L download. Saved screenshot to {screenshot_path}")
        raise e

    # ---------------------
    context.close()
    browser.close()


with sync_playwright() as playwright:
    run(playwright)
