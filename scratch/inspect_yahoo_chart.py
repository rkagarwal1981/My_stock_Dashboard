import requests
import json
import pprint

ticker = "BHARTIARTL.NS"
url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=1d"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
}
try:
    response = requests.get(url, headers=headers, timeout=5)
    if response.status_code == 200:
        res_json = response.json()
        meta = res_json.get("chart", {}).get("result", [{}])[0].get("meta", {})
        print("Meta keys:")
        pprint.pprint(list(meta.keys()))
        print("Meta content:")
        pprint.pprint(meta)
    else:
        print("Failed to fetch, status code:", response.status_code)
except Exception as e:
    print("Error:", e)
