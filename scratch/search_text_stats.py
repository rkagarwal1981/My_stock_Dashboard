import re

path = r"C:\Users\admin\.gemini\antigravity-ide\brain\7a0235d8-afa0-42e5-af07-24112865eb98\.system_generated\steps\201\content.md"

with open(path, "r", encoding="utf-8") as f:
    html = f.read()

# Remove HTML tags to search in pure text
text = re.sub('<[^<]+?>', ' ', html)

# Find all occurrences of words like median or average with some context
for word in ["median", "average", "avg", "p/e"]:
    print(f"\n--- Occurrences of '{word}': ---")
    matches = [m.start() for m in re.finditer(word, text, re.IGNORECASE)]
    print(f"Found {len(matches)} matches:")
    for idx, pos in enumerate(matches[:15]):
        start = max(0, pos - 60)
        end = min(len(text), pos + 60)
        snippet = text[start:end].replace('\n', ' ').strip()
        print(f"Match {idx+1}: ... {snippet} ...")
