import yfinance as yf
import requests

def test_yf_session(symbol):
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    try:
        ticker = yf.Ticker(symbol, session=session)
        info = ticker.info
        print(f"Success for {symbol}!")
        print("Sector:", info.get("sector"))
        print("Industry:", info.get("industry"))
        print("Market Cap:", info.get("marketCap"))
        print("Beta:", info.get("beta"))
        return True
    except Exception as e:
        print(f"Error for {symbol}: {e}")
        return False

if __name__ == "__main__":
    test_yf_session("HDFCBANK.NS")
