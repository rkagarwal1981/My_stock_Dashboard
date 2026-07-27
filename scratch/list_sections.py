from bs4 import BeautifulSoup

path = r"C:\Users\admin\.gemini\antigravity-ide\brain\7a0235d8-afa0-42e5-af07-24112865eb98\.system_generated\steps\201\content.md"

with open(path, "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

print("All Sections:")
for section in soup.find_all('section'):
    sid = section.get('id')
    h2 = section.find('h2')
    h2_text = h2.text.strip() if h2 else "No Title"
    print(f"- ID: {sid}, Title: {h2_text}")
