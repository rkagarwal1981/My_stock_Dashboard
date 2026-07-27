import zipfile
import xml.etree.ElementTree as ET
import os

def get_docx_text(path):
    try:
        with zipfile.ZipFile(path) as docx:
            xml_content = docx.read('word/document.xml')
            root = ET.fromstring(xml_content)
            
            # XML namespace for Word
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            
            texts = []
            for elem in root.iter():
                if elem.tag.endswith('t'): # text elements
                    texts.append(elem.text or "")
            return "".join(texts)
    except Exception as e:
        return f"Error reading {path}: {e}"

files = ["Prompt for webpage.docx", "Project Architecture.docx"]
for f in files:
    if os.path.exists(f):
        print(f"--- {f} ---")
        text = get_docx_text(f)
        print("Length of text:", len(text))
        for line in text.split('.'):
            if any(kw in line.lower() for kw in ["signal", "portfolio", "change", "metrics"]):
                print("-", line.strip())
