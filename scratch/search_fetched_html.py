import re

path = r"C:\Users\admin\.gemini\antigravity-ide\brain\7a0235d8-afa0-42e5-af07-24112865eb98\.system_generated\steps\201\content.md"

with open(path, "r", encoding="utf-8") as f:
    html = f.read()

print("File size:", len(html))

# Search for any ratios
print("Searching for patterns...")
# Screener has data-name or numbers in the company ratio boxes
# Let's search for lines containing "P/E" or "PE"
lines = html.splitlines()
matches = []
for idx, line in enumerate(lines):
    if "p/e" in line.lower() or "price to earning" in line.lower() or "valuation" in line.lower():
        matches.append((idx + 1, line.strip()))

print(f"Found {len(matches)} matches:")
for num, content in matches[:20]:
    print(f"Line {num}: {content[:150]}")

# Let's find numeric values around Stock P/E
# Screener usually has <span class="name">Stock P/E</span> <span class="number">value</span>
pe_match = re.findall(r'Stock P/E.*?class="number">(.*?)</span>', html, re.DOTALL | re.IGNORECASE)
print("\nStock P/E matches:", pe_match)
