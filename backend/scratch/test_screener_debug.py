"""Diagnostic: test concurrent Screener.in scraping with serialization lock."""
import sys, os
import threading
import concurrent.futures
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import requests
from bs4 import BeautifulSoup
import time

FAILING_STOCKS = [
    "ICICIBANK", "TCS", "BHARTIARTL", "JIOFIN", "WAAREEENER",
    "KPITTECH", "UBL", "HEROMOTOCO", "RELIANCE", "HDFCLIFE", "IOC"
]

screener_lock = threading.Lock()

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

def fetch_scrip(symbol):
    with screener_lock:
        print(f"Fetching {symbol}...", flush=True)
        # Serialized request spacing
        time.sleep(0.3)
        url = f"https://www.screener.in/company/{symbol}/"
        try:
            resp = requests.get(url, headers=headers, timeout=8)
            if resp.status_code != 200:
                print(f"  {symbol} FAILED with status {resp.status_code}", flush=True)
                return symbol, f"Status {resp.status_code}"
                
            soup = BeautifulSoup(resp.text, 'html.parser')
            h1 = soup.find('h1')
            company_name = h1.text.strip() if h1 else symbol
            
            # Market Cap
            market_cap = "N/A"
            for span in soup.find_all('span', class_='name'):
                if "market cap" in span.text.lower():
                    parent_li = span.find_parent('li')
                    if parent_li:
                        num_span = parent_li.find('span', class_='number')
                        if num_span:
                            market_cap = num_span.text.strip()
                    break
            
            # Sector
            sector = "Others"
            for div in soup.find_all('div', class_='flex-space-between'):
                text = div.get_text()
                if "peer comparison" in text.lower():
                    parts = [p.strip() for p in text.split('\n') if p.strip()]
                    parts_clean = [p for p in parts if "part of" not in p.lower() and p != "Peer comparison" and p.lower() not in ["columns", "edit columns", "export", "setting", "settings", "add to screen", "edit", "show all"]]
                    if parts_clean:
                        sector = parts_clean[0]
                    break
            
            res_str = f"OK - Name: {company_name}, Cap: {market_cap}, Sector: {sector}"
            print(f"  {symbol}: {res_str}", flush=True)
            return symbol, res_str
        except Exception as e:
            print(f"  {symbol} ERROR: {e}", flush=True)
            return symbol, f"ERROR: {e}"

if __name__ == "__main__":
    print("Starting concurrent test with serialization lock...")
    start_time = time.time()
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(fetch_scrip, FAILING_STOCKS))
        
    for symbol, res in results:
        print(f"{symbol}: {res}")
        
    print(f"Completed in {time.time() - start_time:.2f} seconds.")
