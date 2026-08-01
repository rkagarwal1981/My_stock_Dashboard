import requests
from bs4 import BeautifulSoup

url = "https://www.screener.in/company/BANKBARODA/"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

resp = requests.get(url, headers=headers)
print("Status Code:", resp.status_code)
if resp.status_code == 200:
    soup = BeautifulSoup(resp.text, 'html.parser')
    
    # Check H1 company name
    h1 = soup.find('h1')
    print("Company Name:", h1.text.strip() if h1 else "Not Found")
    
    # Check Peer comparison divs
    found = False
    for div in soup.find_all('div', class_='flex-space-between'):
        text = div.get_text()
        if "peer comparison" in text.lower():
            found = True
            print("\nFound peer comparison div:")
            print("Raw Text:")
            print(repr(text))
            
            parts = [p.strip() for p in text.split('\n') if p.strip()]
            print("\nAll split parts:")
            print(parts)
            
            skip = {"part of", "peer comparison", "columns", "edit columns", "export", "setting", "settings", "add to screen", "edit", "show all"}
            parts_clean = [p for p in parts
                           if p.lower() not in skip
                           and "part of" not in p.lower()
                           and not p.startswith("BSE ")
                           and not p.startswith("Nifty ")
                           and not p.startswith("NIFTY ")]
            print("\nClean parts:")
            print(parts_clean)
            break
            
    if not found:
        print("\nCould NOT find peer comparison div on page!")
