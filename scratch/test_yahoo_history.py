import requests
import pprint
from datetime import datetime

ticker = "BHARTIARTL.NS"
url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=3y&interval=1mo"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

try:
    response = requests.get(url, headers=headers, timeout=5)
    print("Status code:", response.status_code)
    if response.status_code == 200:
        res_json = response.json()
        result = res_json.get("chart", {}).get("result", [{}])[0]
        timestamp = result.get("timestamp", [])
        indicators = result.get("indicators", {}).get("quote", [{}])[0]
        close_prices = indicators.get("close", [])
        
        print(f"Retrieved {len(timestamp)} monthly price records.")
        for ts, close in list(zip(timestamp, close_prices))[-5:]:
            dt = datetime.fromtimestamp(ts)
            print(f"  Date: {dt.strftime('%Y-%m-%d')}, Close: {close}")
    else:
        print("Failed:", response.text[:200])
except Exception as e:
    print("Error:", e)
