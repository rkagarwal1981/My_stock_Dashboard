import yfinance as yf
import pandas as pd
import numpy as np
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta

# Define the ticker for Reliance Industries on NSE (NSE: RELIANCE.NS)
ticker = "RELIANCE.NS"

# Configure requests session with custom User-Agent to bypass rate limiting
session = requests.Session()
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}
session.headers.update(headers)

current_pe = None
latest_eps = None

# Step 1: Try fetching current P/E and EPS from Screener.in first (highly reliable)
try:
    url = f"https://www.screener.in/company/RELIANCE/consolidated/"
    r = session.get(url, timeout=5)
    if r.status_code == 200:
        soup = BeautifulSoup(r.text, 'html.parser')
        for li in soup.find_all('li'):
            name_span = li.find('span', class_='name')
            if name_span and 'Stock P/E' in name_span.text:
                val_span = li.find('span', class_='number')
                if val_span:
                    current_pe = float(val_span.text.strip())
                    print(f"Current P/E (from Screener.in): {current_pe:.2f}")
                    break
except Exception as e:
    print("Could not fetch P/E from Screener.in:", e)

# Step 2: Try fetching historical prices and current metrics from Yahoo Chart API (bypasses 429 blocks)
try:
    chart_url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=3y&interval=1d"
    chart_res = session.get(chart_url, timeout=5)
    if chart_res.status_code == 200:
        data = chart_res.json()
        result = data.get("chart", {}).get("result", [])[0]
        meta = result.get("meta", {})
        current_price = meta.get("regularMarketPrice")
        
        # Calculate EPS if we have price and PE
        if current_price and current_pe:
            latest_eps = current_price / current_pe
            print(f"Current Price: {current_price:.2f}")
            print(f"Calculated EPS (TTM): {latest_eps:.2f}")
            
        # Parse historical daily closing prices
        timestamps = result.get("timestamp", [])
        adjclose = result.get("indicators", {}).get("adjclose", [{}])[0].get("adjclose", [])
        
        if timestamps and adjclose:
            hist_df = pd.DataFrame({
                "Date": pd.to_datetime(timestamps, unit="s"),
                "Close": adjclose
            }).dropna()
            
            if latest_eps and latest_eps > 0:
                hist_df['Daily_PE'] = hist_df['Close'] / latest_eps
                average_pe_3yr = hist_df['Daily_PE'].mean()
                print(f"3-Year Average P/E: {average_pe_3yr:.2f}")
            else:
                # If we couldn't get EPS from screener, try fetching EPS from yfinance as a last fallback
                print("Retrieving EPS from Yahoo Finance as fallback...")
                reliance = yf.Ticker(ticker, session=session)
                info = reliance.info
                latest_eps = info.get('trailingEps')
                if latest_eps and latest_eps > 0:
                    hist_df['Daily_PE'] = hist_df['Close'] / latest_eps
                    average_pe_3yr = hist_df['Daily_PE'].mean()
                    print(f"Current P/E (TTM): {info.get('trailingPE'):.2f}")
                    print(f"3-Year Average P/E: {average_pe_3yr:.2f}")
                else:
                    print("Could not retrieve EPS for P/E calculation.")
        else:
            print("No historical price data found in Chart API.")
    else:
        print("Yahoo Chart API returned status:", chart_res.status_code)
except Exception as e:
    print("Error calculating average P/E:", e)