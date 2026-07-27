import yfinance as yf
import pprint

print("Querying BHARTIARTL.NS...")
ticker = yf.Ticker("BHARTIARTL.NS")
info = ticker.info

pe_keys = [k for k in info.keys() if "pe" in k.lower() or "price" in k.lower() or "ratio" in k.lower() or "earning" in k.lower()]
print("PE related keys in info:")
for k in pe_keys:
    print(f"- {k}: {info.get(k)}")

print("\n--- Summary of some standard PE keys ---")
print("trailingPE:", info.get("trailingPE"))
print("forwardPE:", info.get("forwardPE"))
print("priceToSalesTrailing12Months:", info.get("priceToSalesTrailing12Months"))

# Let's check financial history to see if we can compute historical PE (e.g. historical price divided by EPS)
print("\n--- Financials ---")
try:
    print(ticker.financials)
except Exception as e:
    print("Error getting financials:", e)

try:
    print("\n--- Earnings ---")
    print(ticker.earnings)
except Exception as e:
    print("Error getting earnings:", e)
