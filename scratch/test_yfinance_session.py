import yfinance as yf
import requests

print("Querying BHARTIARTL.NS using custom requests session...")
session = requests.Session()
session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
})

try:
    ticker = yf.Ticker("BHARTIARTL.NS", session=session)
    info = ticker.info
    print("trailingPE:", info.get("trailingPE"))
    print("forwardPE:", info.get("forwardPE"))
except Exception as e:
    print("Error:", e)
