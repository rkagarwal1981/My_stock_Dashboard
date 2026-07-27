import re
from bs4 import BeautifulSoup

path = r"C:\Users\admin\.gemini\antigravity-ide\brain\7a0235d8-afa0-42e5-af07-24112865eb98\.system_generated\steps\201\content.md"

with open(path, "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

# Find P&L section
# Screener usually has sections like <section id="profit-loss">
pl_section = soup.find('section', id='profit-loss')
if pl_section:
    print("Found profit-loss section!")
    
    # Let's find the headers (years)
    headers = [th.text.strip() for th in pl_section.find_all('th')]
    print("Headers:", headers)
    
    # Find all table rows
    for row in pl_section.find_all('tr'):
        cells = [td.text.strip() for td in row.find_all(['td', 'th'])]
        if any("eps" in str(c).lower() for c in cells):
            print("EPS Row:", cells)
            
            # Match headers and cells
            # Headers might be longer, let's pair them up from the end
            years = [h for h in headers if re.search(r'(Mar|Dec|Jun|Sep)\s+\d{4}|TTM', h)]
            values = cells[1:]
            print("Paired:")
            for y, v in zip(years[-len(values):], values):
                print(f"  {y}: {v}")
else:
    print("Profit-loss section not found.")
