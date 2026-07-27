import requests
import pprint

ticker = "BHARTIARTL.NS"
url = f"https://query1.finance.yahoo.com/v7/finance/quote?symbols={ticker}"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

try:
    response = requests.get(url, headers=headers, timeout=5)
    print("Status code:", response.status_code)
    if response.status_code == 200:
        res_json = response.json()
        result = res_json.get("quoteResponse", {}).get("result", [{}])
        if result:
            quote = result[0]
            print("Quote keys:")
            pprint.pprint(list(quote.keys()))
            print("\nValues:")
            print("trailingPE:", quote.get("trailingPE"))
            print("forwardPE:", quote.get("forwardPE"))
            print("epsTrailingTwelveMonths:", quote.get("epsTrailingTwelveMonths"))
            print("epsForward:", quote.get("epsForward"))
            print("priceToBook:", quote.get("priceToBook"))
        else:
            print("No result found.")
    else:
        print("Content:", response.text[:200])
except Exception as e:
    print("Error:", e)
