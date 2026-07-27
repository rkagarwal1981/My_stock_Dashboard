import re

path = r"C:\Users\admin\.gemini\antigravity-ide\brain\7a0235d8-afa0-42e5-af07-24112865eb98\.system_generated\steps\201\content.md"

with open(path, "r", encoding="utf-8") as f:
    html = f.read()

text = re.sub('<[^<]+?>', ' ', html)

print("Searching for 'EPS'...")
matches = [m.start() for m in re.finditer(r"\bEPS\b", text, re.IGNORECASE)]
print(f"Found {len(matches)} matches:")
for idx, pos in enumerate(matches[:20]):
    start = max(0, pos - 60)
    end = min(len(text), pos + 60)
    snippet = text[start:end].replace('\n', ' ').strip()
    print(f"Match {idx+1}: ... {snippet} ...")
