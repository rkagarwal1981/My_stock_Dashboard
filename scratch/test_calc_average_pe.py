import requests
import re
from bs4 import BeautifulSoup
from datetime import datetime

def get_stock_pe_info(scrip):
    clean_scrip = scrip
    if scrip.endswith("-EQ"):
        clean_scrip = scrip[:-3]
    clean_scrip = clean_scrip.strip().upper()
    
    # 1. Fetch from Screener.in
    url = f"https://www.screener.in/company/{clean_scrip}/"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    pe_ratio = None
    eps_history = {}
    
    try:
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Find current PE ratio
            for span in soup.find_all('span', class_='name'):
                if "stock p/e" in span.text.lower():
                    parent_li = span.find_parent('li')
                    if parent_li:
                        num_span = parent_li.find('span', class_='number')
                        if num_span:
                            try:
                                pe_ratio = float(num_span.text.replace(',', '').strip())
                            except ValueError:
                                pass
                    break
            
            # Find P&L section for EPS history
            pl_section = soup.find('section', id='profit-loss')
            if pl_section:
                headers_list = [th.text.strip() for th in pl_section.find_all('th')]
                years = []
                for h in headers_list:
                    match = re.search(r'Mar\s+(\d{4})', h, re.I)
                    if match:
                        years.append(int(match.group(1)))
                
                for row in pl_section.find_all('tr'):
                    cells = [td.text.strip() for td in row.find_all(['td', 'th'])]
                    if cells and any("eps in rs" in str(c).lower() for c in cells):
                        values = cells[1:]
                        for y, v in zip(years[-len(values):], values):
                            try:
                                if v:
                                    eps_history[y] = float(v.replace(',', '').strip())
                            except ValueError:
                                pass
    except Exception as e:
        print(f"Screener scraping error for {clean_scrip}: {e}")
        
    # 2. Fetch prices from Yahoo Finance
    yahoo_ticker = f"{clean_scrip}.NS"
    yahoo_url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_ticker}?range=3y&interval=1mo"
    
    prices_by_year = {} # Year -> March Closing Price
    
    try:
        response = requests.get(yahoo_url, headers=headers, timeout=5)
        if response.status_code == 200:
            res_json = response.json()
            result = res_json.get("chart", {}).get("result", [{}])[0]
            timestamps = result.get("timestamp", [])
            indicators = result.get("indicators", {}).get("quote", [{}])[0]
            close_prices = indicators.get("close", [])
            
            for ts, close in zip(timestamps, close_prices):
                if close is not None:
                    dt = datetime.fromtimestamp(ts)
                    # We look for March price (month = 3)
                    if dt.month == 3:
                        prices_by_year[dt.year] = float(close)
    except Exception as e:
        print(f"Yahoo history scraping error for {yahoo_ticker}: {e}")
        
    # 3. Calculate 3 Years average PE
    # We want average of last 3 completed fiscal years from Screener EPS
    # Let's check available years in eps_history
    available_years = sorted(list(eps_history.keys()))
    pe_history = []
    
    # We will look at the last 3 years that have both EPS and March Price
    # Note: if the latest year is 2026, we look at 2023, 2024, 2025
    # Let's check the last 3 years in available_years
    calc_details = []
    for y in available_years[-4:]: # look at the latest few years
        eps = eps_history.get(y)
        price = prices_by_year.get(y)
        
        # If we don't have March price from Yahoo (e.g. current year March is not in historical data yet),
        # we can skip it or try to fetch it
        if eps is not None and price is not None and eps > 0.0001:
            pe = price / eps
            pe_history.append(pe)
            calc_details.append(f"Year {y}: Price={price:.2f}, EPS={eps:.2f} => PE={pe:.2f}")
            
    # Calculate average of the latest 3 calculated PE ratios
    avg_pe_3y = None
    if len(pe_history) >= 1:
        latest_3_pes = pe_history[-3:]
        avg_pe_3y = sum(latest_3_pes) / len(latest_3_pes)
        
    return {
        "scrip": clean_scrip,
        "current_pe": pe_ratio,
        "avg_pe_3y": avg_pe_3y,
        "calc_details": calc_details
    }

print("Running test calculation for BHARTIARTL...")
res = get_stock_pe_info("BHARTIARTL")
print("Result:")
print(f"  Current PE: {res['current_pe']}")
print(f"  3Y Avg PE: {res['avg_pe_3y']:.2f}" if res['avg_pe_3y'] else "  3Y Avg PE: None")
print("  Calculation Details:")
for detail in res["calc_details"]:
    print("   ", detail)
