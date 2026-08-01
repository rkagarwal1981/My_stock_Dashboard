import requests
from bs4 import BeautifulSoup
import re

def scrape_screener(scrip):
    clean_scrip = scrip
    for suffix in ["-EQ", "-BE", "-BL", "-BZ"]:
        if scrip.endswith(suffix):
            clean_scrip = scrip[:-len(suffix)]
            break
    clean_scrip = clean_scrip.strip().upper()
    
    url = f"https://www.screener.in/company/{clean_scrip}/"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=5)
        print(f"Status for {clean_scrip}: {response.status_code}")
        if response.status_code != 200:
            return None
            
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 1. Company Name
        h1 = soup.find('h1')
        company_name = h1.text.strip() if h1 else clean_scrip
        
        # 2. Market Cap
        market_cap_inr = 0.0
        for span in soup.find_all('span', class_='name'):
            if "market cap" in span.text.lower():
                parent_li = span.find_parent('li')
                if parent_li:
                    num_span = parent_li.find('span', class_='number')
                    if num_span:
                        try:
                            # Value is in Crores, e.g., "1,245,670" or "5,000"
                            val_str = num_span.text.replace(',', '').strip()
                            crores = float(val_str)
                            market_cap_inr = crores * 10_000_000.0 # 1 Crore = 10,000,000
                        except ValueError:
                            pass
                break
                
        # 3. Sector and Industry
        sector = "Others"
        industry = "Others"
        
        # Find the peer comparison container
        for div in soup.find_all('div', class_='flex-space-between'):
            text = div.get_text()
            if "peer comparison" in text.lower():
                # Split by newline and clean
                parts = [p.strip() for p in text.split('\n') if p.strip()]
                if len(parts) > 1:
                    # Let's filter out "Part of", "Peer comparison", and button labels
                    parts_clean = [p for p in parts if "part of" not in p.lower() and p != "Peer comparison" and p.lower() not in ["columns", "edit columns", "export", "setting", "settings", "add to screen", "edit"]]
                    if parts_clean:
                        sector = parts_clean[0]
                        if len(parts_clean) >= 4:
                            industry = parts_clean[3]
                        elif len(parts_clean) >= 3:
                            industry = parts_clean[2]
                        else:
                            industry = parts_clean[-1]
                break
        
        return {
            "company_name": company_name,
            "market_cap": market_cap_inr,
            "sector": sector,
            "industry": industry
        }
    except Exception as e:
        print(f"Error scraping {clean_scrip}: {e}")
        return None

if __name__ == "__main__":
    for s in ["HDFCBANK", "RELIANCE", "TCS", "UNOMINDA"]:
        res = scrape_screener(s)
        print(f"Result for {s}:", res)
        print("-" * 40)
