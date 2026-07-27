from bs4 import BeautifulSoup

path = r"C:\Users\admin\.gemini\antigravity-ide\brain\7a0235d8-afa0-42e5-af07-24112865eb98\.system_generated\steps\201\content.md"

with open(path, "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

ratios_section = soup.find('section', id='ratios')
if ratios_section:
    print("Found ratios section!")
    for row in ratios_section.find_all('tr'):
        cells = [td.text.strip() for td in row.find_all(['td', 'th'])]
        print(cells)
else:
    print("Ratios section not found.")
