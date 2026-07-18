import concurrent.futures
import requests
from typing import List, Dict

def fetch_single_ticker_data(ticker: str) -> tuple:
    """
    Fetches the regularMarketPrice and regularMarketChangePercent (or computes from chartPreviousClose) for a single Yahoo ticker.
    Uses Yahoo Finance Chart API v8 which does not require cookies/crumbs.
    """
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=1d"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    }
    try:
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            res_json = response.json()
            result = res_json.get("chart", {}).get("result")
            if result and len(result) > 0:
                meta = result[0].get("meta", {})
                price = meta.get("regularMarketPrice")
                prev_close = meta.get("chartPreviousClose")
                
                if price is None:
                    price = prev_close
                
                change_pct = 0.0
                if price is not None and prev_close is not None and prev_close > 0:
                    change_pct = ((price - prev_close) / prev_close) * 100
                
                if price is not None:
                    return float(price), float(change_pct)
    except Exception as e:
        print(f"Error fetching price/change for ticker {ticker}: {e}")
    return 0.0, 0.0

def fetch_live_prices(scrip_names: List[str]) -> Dict[str, Dict[str, float]]:
    """
    Fetches live market prices and daily change percentage for a list of scrip names (e.g. 'UNOMINDA-EQ', 'HEROMOTOCO-EQ')
    by querying Yahoo Finance Chart API in parallel.
    Returns a dictionary mapping the original scrip name to a dict with 'price' and 'change_pct'.
    """
    if not scrip_names:
        return {}

    # Clean duplicates and map tickers for Yahoo Finance (.NS for Indian markets)
    clean_mapping = {}  # yahoo_ticker -> original_scrip
    tickers_list = []
    
    for name in scrip_names:
        clean_name = name
        if name.endswith("-EQ"):
            clean_name = name[:-3]
        
        clean_name = clean_name.strip()
        
        if "FUT" in clean_name or "CALL" in clean_name or "PUT" in clean_name or "MCX" in name:
            # Skip commodity futures or option instruments
            continue
            
        yahoo_ticker = f"{clean_name}.NS"
        clean_mapping[yahoo_ticker] = name
        tickers_list.append(yahoo_ticker)
        
    tickers_list = list(set(tickers_list))
    prices = {name: {"price": 0.0, "change_pct": 0.0} for name in scrip_names}
    
    if not tickers_list:
        return prices

    # Query in parallel to avoid sequential delays blocking the main uvicorn thread
    max_workers = min(len(tickers_list), 15)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_ticker = {executor.submit(fetch_single_ticker_data, t): t for t in tickers_list}
        for future in concurrent.futures.as_completed(future_to_ticker):
            ticker = future_to_ticker[future]
            orig_name = clean_mapping[ticker]
            try:
                price, change_pct = future.result()
                if price > 0.0:
                    prices[orig_name] = {"price": price, "change_pct": change_pct}
            except Exception as e:
                print(f"Exception retrieving price for {ticker}: {e}")
                
    return prices


def fetch_pe_info(scrip: str) -> tuple:
    """
    Fetches the current P/E and calculates the 3-year average P/E of a stock.
    Returns: (current_pe: Optional[float], avg_pe_3y: Optional[float])
    """
    import re
    from bs4 import BeautifulSoup
    from datetime import datetime

    clean_scrip = scrip
    if scrip.endswith("-EQ"):
        clean_scrip = scrip[:-3]
    clean_scrip = clean_scrip.strip().upper()

    current_pe = None
    avg_pe_3y = None

    # 1. Fetch from Screener.in
    screener_url = f"https://www.screener.in/company/{clean_scrip}/"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    eps_history = {}
    try:
        response = requests.get(screener_url, headers=headers, timeout=5)
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
                                current_pe = float(num_span.text.replace(',', '').strip())
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
        print(f"Error scraping Screener.in PE details for {clean_scrip}: {e}")

    # 2. Fetch prices from Yahoo Finance
    yahoo_ticker = f"{clean_scrip}.NS"
    yahoo_url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_ticker}?range=3y&interval=1mo"

    prices_by_year = {}
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
                    if dt.month == 3:
                        prices_by_year[dt.year] = float(close)
    except Exception as e:
        print(f"Error fetching Yahoo price history for {yahoo_ticker}: {e}")

    # 3. Calculate 3 Years average PE
    available_years = sorted(list(eps_history.keys()))
    pe_history = []

    for y in available_years[-4:]:
        eps = eps_history.get(y)
        price = prices_by_year.get(y)
        if eps is not None and price is not None and eps > 0.0001:
            pe_history.append(price / eps)

    if len(pe_history) >= 1:
        latest_3_pes = pe_history[-3:]
        avg_pe_3y = sum(latest_3_pes) / len(latest_3_pes)

    return current_pe, avg_pe_3y

