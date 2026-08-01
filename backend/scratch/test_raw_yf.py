import requests
import json

def test_fetch(symbol):
    url = f"https://query2.finance.yahoo.com/v7/finance/quote?symbols={symbol}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        response = requests.get(url, headers=headers, timeout=5)
        print(f"Status for {symbol}: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            result = data.get("quoteResponse", {}).get("result")
            if result and len(result) > 0:
                quote = result[0]
                print(json.dumps(quote, indent=2))
                return True
        else:
            print("Response:", response.text[:200])
    except Exception as e:
        print("Error:", e)
    return False

if __name__ == "__main__":
    test_fetch("HDFCBANK.NS")
    test_fetch("TCS.NS")
