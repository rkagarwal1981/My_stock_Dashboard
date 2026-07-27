import requests
import json
import pprint

ticker = "BHARTIARTL.NS"
url = f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{ticker}?modules=summaryDetail,defaultKeyStatistics"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}

try:
    response = requests.get(url, headers=headers, timeout=5)
    print("Status code:", response.status_code)
    if response.status_code == 200:
        res_json = response.json()
        result = res_json.get("quoteSummary", {}).get("result", [{}])[0]
        
        summary_detail = result.get("summaryDetail", {})
        key_stats = result.get("defaultKeyStatistics", {})
        
        pe_ratio = summary_detail.get("trailingPE", {}).get("raw")
        if not pe_ratio:
            pe_ratio = summary_detail.get("forwardPE", {}).get("raw")
            
        print("PE Ratio:", pe_ratio)
        print("Summary detail keys:", list(summary_detail.keys()))
        print("Key stats keys:", list(key_stats.keys()))
        
        # Let's see if there is any 3Y Avg PE or similar
        print("\ntrailingPE:", summary_detail.get("trailingPE"))
        print("forwardPE:", summary_detail.get("forwardPE"))
        print("priceToBook:", summary_detail.get("priceToBook"))
    else:
        print("Content:", response.text[:200])
except Exception as e:
    print("Error:", e)
