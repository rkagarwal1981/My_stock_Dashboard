import os
import re
import json
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_DIR = os.path.join(WORKSPACE_ROOT, "backend", "database")
os.makedirs(DB_DIR, exist_ok=True)

NEWS_CACHE_PATH = os.path.join(DB_DIR, "latest_holdings_news_cache.json")
MANUAL_NEWS_DIR = os.path.join(WORKSPACE_ROOT, "Manual Data", "News")

# Pure ETFs / Sovereign Gold Bonds / Liquid funds
ETF_AND_NON_EQUITY_SCRIPTS = {
    "LIQUIDBEES", "NIFTYBEES", "GOLDBEES", "SILVERBEES",
    "CPSEETF", "FMCGIETF", "ITIETF", "HDFCSML250",
    "HNGSNGBEES", "SGBAUG28V", "MID150BEES", "BANKBEES",
    "JUNIORBEES", "ITBEES", "PHARMABEES", "PSUBNKBEES",
}

# Mapping of NSE symbols to clean display company names
COMPANY_NAME_MAP: Dict[str, str] = {
    "AADHARHFC": "Aadhar Housing Finance",
    "AAVAS": "Aavas Financiers",
    "ACC": "ACC Cement",
    "ADANIENT": "Adani Enterprises",
    "ANANTRAJ": "Anant Raj",
    "APOLLOHOSP": "Apollo Hospitals",
    "ASTRAL": "Astral Ltd",
    "BAJAJHFL": "Bajaj Housing Finance",
    "BANKBARODA": "Bank of Baroda",
    "BDL": "Bharat Dynamics (BDL)",
    "BEL": "Bharat Electronics Ltd (BEL)",
    "BHARTIARTL": "Bharti Airtel",
    "BRIGADE": "Brigade Enterprises",
    "BRITANNIA": "Britannia Industries",
    "CAMS": "CAMS",
    "CESC": "CESC",
    "CIEINDIA": "CIE Automotive India",
    "CMSINFO": "CMS Info Systems",
    "COALINDIA": "Coal India",
    "CONCOR": "Container Corporation (CONCOR)",
    "CRISIL": "CRISIL",
    "CROMPTON": "Crompton Greaves Consumer",
    "CUMMINSIND": "Cummins India",
    "DABUR": "Dabur India",
    "DIXON": "Dixon Technologies",
    "DLF": "DLF Ltd",
    "DRREDDY": "Dr. Reddy's Laboratories",
    "EIDPARRY": "EID Parry",
    "EXIDEIND": "Exide Industries",
    "FORTIS": "Fortis Healthcare",
    "FRACTAL": "Fractal Analytics",
    "GODREJCP": "Godrej Consumer Products",
    "GRAVITA": "Gravita India",
    "GVT&D": "GE Vernova T&D India",
    "HAVELLS": "Havells India",
    "HCG": "Healthcare Global (HCG)",
    "HDFCAMC": "HDFC AMC",
    "HDFCBANK": "HDFC Bank",
    "HDFCLIFE": "HDFC Life Insurance",
    "HEROMOTOCO": "Hero MotoCorp",
    "HEXT": "Hexaware Technologies",
    "HINDCOPPER": "Hindustan Copper",
    "HINDUNILVR": "Hindustan Unilever (HUL)",
    "HINDZINC": "Hindustan Zinc",
    "HONAUT": "Honeywell Automation India",
    "HUDCO": "HUDCO",
    "ICICIBANK": "ICICI Bank",
    "ICICIGI": "ICICI Lombard General Insurance",
    "ICICILIFE": "ICICI Prudential Life",
    "ICICIAMC": "ICICI Prudential AMC",
    "ICRA": "ICRA",
    "IGIL": "International Gemmological Institute (IGIL)",
    "IGL": "Indraprastha Gas (IGL)",
    "INDHOTEL": "Indian Hotels Company (IHCL)",
    "INDRAMEDCO": "Indraprastha Medical Corp",
    "INDUSINDBK": "IndusInd Bank",
    "INDUSTOWER": "Indus Towers",
    "INFY": "Infosys",
    "IOC": "Indian Oil Corporation (IOC)",
    "IRCTC": "IRCTC",
    "IREDA": "IREDA",
    "IRFC": "IRFC",
    "ITC": "ITC Ltd",
    "JIOFIN": "Jio Financial Services",
    "JPL": "Jagran Prakashan",
    "JSLL": "Jeena Sikho Lifecare",
    "JWL": "Jupiter Wagons",
    "KAYNES": "Kaynes Technology",
    "KEI": "KEI Industries",
    "KFINTECH": "KFin Technologies",
    "KPITTECH": "KPIT Technologies",
    "KRSNAA": "Krsnaa Diagnostics",
    "LICI": "LIC India",
    "LT": "Larsen & Toubro (L&T)",
    "LUPIN": "Lupin",
    "M&M": "Mahindra & Mahindra (M&M)",
    "MARUTI": "Maruti Suzuki",
    "MAXHEALTH": "Max Healthcare",
    "NCC": "NCC Ltd",
    "NESTLEIND": "Nestle India",
    "NSE": "National Stock Exchange (NSE)",
    "NTPC": "NTPC Ltd",
    "NTPCGREEN": "NTPC Green Energy",
    "ONGC": "ONGC",
    "PATELENG": "Patel Engineering",
    "PFIZER": "Pfizer India",
    "PICCADIL": "Piccadily Agro",
    "PIIND": "PI Industries",
    "POLYCAB": "Polycab India",
    "POWERGRID": "Power Grid Corporation",
    "POWERINDIA": "Hitachi Energy India",
    "PREMIERENE": "Premier Energies",
    "RECLTD": "REC Ltd",
    "RELIANCE": "Reliance Industries",
    "SBIN": "State Bank of India (SBI)",
    "SHALBY": "Shalby Hospitals",
    "SOLARINDS": "Solar Industries India",
    "SRF": "SRF Ltd",
    "SULA": "Sula Vineyards",
    "SUNPHARMA": "Sun Pharma",
    "SUPREMEIND": "Supreme Industries",
    "TARIL": "Transformers and Rectifiers (TARIL)",
    "TATACONSUM": "Tata Consumer Products",
    "TATAMOTORS": "Tata Motors",
    "TATAPOWER": "Tata Power",
    "TATATECH": "Tata Technologies",
    "TCS": "Tata Consultancy Services (TCS)",
    "TENNIND": "Tenneco Clean Air India",
    "THERMAX": "Thermax",
    "THYROCARE": "Thyrocare Technologies",
    "TIINDIA": "Tube Investments of India",
    "TITAGARH": "Titagarh Rail Systems",
    "TMPV": "Tata Motors Passenger Vehicles",
    "TRIDENT": "Trident Ltd",
    "TRITURBINE": "Triveni Turbine",
    "UBL": "United Breweries (UBL)",
    "VBL": "Varun Beverages (VBL)",
    "WAAREEENER": "Waaree Energies",
}

# Explicit aliases for common names used in CNBC Awaaz notes -> NSE symbol
STOCK_ALIASES: Dict[str, str] = {
    "hdfc bank": "HDFCBANK",
    "hdfc life": "HDFCLIFE",
    "hdfc life insurance": "HDFCLIFE",
    "hdfc amc": "HDFCAMC",
    "britannia": "BRITANNIA",
    "britannia industries": "BRITANNIA",
    "bharat electronics": "BEL",
    "bharat electronics ltd": "BEL",
    "bharat electronics ltd (bel)": "BEL",
    "bel": "BEL",
    "mahindra & mahindra": "M&M",
    "mahindra and mahindra": "M&M",
    "mahindra & mahindra (m&m)": "M&M",
    "m&m": "M&M",
    "thermax": "THERMAX",
    "thermax ltd": "THERMAX",
    "astral": "ASTRAL",
    "astral ltd": "ASTRAL",
    "astral pipes": "ASTRAL",
    "havells": "HAVELLS",
    "havells india": "HAVELLS",
    "havells india ltd": "HAVELLS",
    "itc": "ITC",
    "itc ltd": "ITC",
    "fractal": "FRACTAL",
    "fractal analytics": "FRACTAL",
    "rec": "RECLTD",
    "rec ltd": "RECLTD",
    "rural electrification": "RECLTD",
    "reliance": "RELIANCE",
    "reliance industries": "RELIANCE",
    "reliance industries ltd": "RELIANCE",
    "ril": "RELIANCE",
    "l&t": "LT",
    "larsen & toubro": "LT",
    "larsen and toubro": "LT",
    "icici bank": "ICICIBANK",
    "bharti airtel": "BHARTIARTL",
    "airtel": "BHARTIARTL",
    "hul": "HINDUNILVR",
    "hindustan unilever": "HINDUNILVR",
    "tata consultancy services": "TCS",
    "tcs": "TCS",
    "infosys": "INFY",
    "state bank of india": "SBIN",
    "sbi": "SBIN",
}

PRICE_IMPACT_KEYWORDS: Dict[str, List[str]] = {
    "Earnings & Financials": [
        "q1", "q2", "q3", "q4", "quarter", "results", "net profit", "profit", "revenue",
        "ebitda", "margin", "margins", "pat", "earnings", "topline", "bottomline",
        "volume growth", "wrp growth", "guidance", "fy26", "fy27", "eps",
    ],
    "Order Win & Launch": [
        "order", "contract", "letter of award", "loa", "mou", "bagged", "bags", "wins",
        "won", "project", "capex", "expansion", "plant", "commissioning", "launch",
        "launches", "facelift", "pipeline",
    ],
    "Brokerage & Target Price": [
        "target price", "target", "upgrade", "upgrades", "downgrade", "downgrades",
        "buy call", "sell call", "overweight", "underweight", "outperform", "underperform",
        "brokerage", "jefferies", "motilal", "goldman", "morgan stanley", "nomura", "clsa",
        "macquarie", "kotak", "icici securities", "axis securities", "emkay", "nuvama",
        "ubs", "citi", "upside", "top pick", "initiated coverage",
    ],
    "Promoter & Institutional Action": [
        "promoter", "promoter buying", "fii", "fii inflow", "dii", "stake", "block deal",
        "bulk deal", "open market", "qrg investment", "buyback", "dividend", "acquisition",
    ],
    "Price Hike & Technical Setup": [
        "price hike", "hike", "technical reversal", "double-bottom", "base formation",
        "breakout", "reversal", "chart pattern", "catch-up", "rebound",
    ],
}

BULLISH_TERMS = [
    "surge", "surges", "jump", "jumps", "soar", "soars", "rally", "rallies", "gain", "gains",
    "rise", "rises", "higher", "beats", "surprise", "order win", "bags", "bagged", "wins",
    "won", "upgrade", "upgrades", "raises target", "hikes target", "top pick", "initiated coverage",
    "upside", "positive", "good buying", "strong", "rebound", "inflow", "promoter buying",
    "bought", "price hike", "support", "reversal", "double-bottom", "bullish", "growth",
]

BEARISH_TERMS = [
    "fall", "falls", "drop", "drops", "plunge", "plunges", "slump", "slumps", "decline",
    "declines", "lower", "loss", "misses", "missed", "downgrade", "downgrades", "cuts target",
    "cut its target", "target price cut", "slashes target", "sell", "underperform",
    "underweight", "weakness", "compression", "contracted", "down ", "bearish", "cut by",
]

IGNORE_LINE_PATTERNS = [
    r"^here is the summary of",
    r"^here are the key highlights",
    r"^below is the summary",
    r"would you like a similar breakdown",
    r"would you like a detailed look",
    r"would you like me to",
    r"^let me know if you",
]


def clean_script_symbol(script: str) -> str:
    s = (script or "").strip().upper()
    if s.endswith("-EQ"):
        s = s[:-3]
    return s


def _should_ignore_line(line: str) -> bool:
    clean = re.sub(r"^[^\w]+", "", line).strip().lower()
    if not clean:
        return True
    for pat in IGNORE_LINE_PATTERNS:
        if re.search(pat, clean):
            return True
    return False


def _read_docx_lines(file_path: str) -> List[str]:
    """Extracts paragraph lines from a .docx Word file using standard library zipfile + xml."""
    lines: List[str] = []
    try:
        with zipfile.ZipFile(file_path) as z:
            if "word/document.xml" not in z.namelist():
                return []
            xml_content = z.read("word/document.xml")
        tree = ET.fromstring(xml_content)
        ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        for p in tree.findall(".//w:p", ns):
            texts = [t.text for t in p.findall(".//w:t", ns) if t.text]
            line = "".join(texts).strip()
            if line and not _should_ignore_line(line):
                lines.append(line)
    except Exception as e:
        print(f"[News Service] Failed reading docx {file_path}: {e}")
    return lines


def _read_text_lines(file_path: str) -> List[str]:
    """Extracts lines from a .txt or .md file."""
    lines: List[str] = []
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            for raw in f:
                line = raw.strip()
                if line and not _should_ignore_line(line):
                    lines.append(line)
    except Exception as e:
        print(f"[News Service] Failed reading text file {file_path}: {e}")
    return lines


MONTH_MAP = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


def _parse_date_from_filename(filename: str, fallback_mtime: float) -> Tuple[datetime, str]:
    """
    Extracts the news date from filenames like:
      - 'CNBC 6th Nov.docx' -> (2026-11-06, '06 Nov 2026')
      - 'CNBC 12th Nov 2026.docx' -> (2026-11-12, '12 Nov 2026')
      - '2026-11-10.docx' -> (2026-11-10, '10 Nov 2026')
      - '10-11-2026.docx' -> (2026-11-10, '10 Nov 2026')
    Falls back to file modified time if no date pattern is present.
    """
    stem = os.path.splitext(filename)[0]
    fallback_dt = datetime.fromtimestamp(fallback_mtime)
    default_year = fallback_dt.year

    # Pattern 1: "6th Nov", "12th November 2026", "6 Nov"
    m1 = re.search(
        r"\b(\d{1,2})(?:st|nd|rd|th)?\s*[-_\s]?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*[-_,\s]?\s*(20\d{2}))?\b",
        stem,
        re.IGNORECASE,
    )
    if m1:
        day = int(m1.group(1))
        mon_str = m1.group(2).lower()
        month = MONTH_MAP.get(mon_str[:3], fallback_dt.month)
        year = int(m1.group(3)) if m1.group(3) else default_year
        try:
            dt = datetime(year, month, day)
            return dt, dt.strftime("%d %b %Y")
        except ValueError:
            pass

    # Pattern 2: "Nov 6th", "November 12"
    m2 = re.search(
        r"\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*[-_\s]?\s*(\d{1,2})(?:st|nd|rd|th)?(?:\s*[-_,\s]?\s*(20\d{2}))?\b",
        stem,
        re.IGNORECASE,
    )
    if m2:
        mon_str = m2.group(1).lower()
        day = int(m2.group(2))
        month = MONTH_MAP.get(mon_str[:3], fallback_dt.month)
        year = int(m2.group(3)) if m2.group(3) else default_year
        try:
            dt = datetime(year, month, day)
            return dt, dt.strftime("%d %b %Y")
        except ValueError:
            pass

    # Pattern 3: YYYY-MM-DD
    m3 = re.search(r"\b(20\d{2})[-_](\d{1,2})[-_](\d{1,2})\b", stem)
    if m3:
        try:
            dt = datetime(int(m3.group(1)), int(m3.group(2)), int(m3.group(3)))
            return dt, dt.strftime("%d %b %Y")
        except ValueError:
            pass

    # Pattern 4: DD-MM-YYYY
    m4 = re.search(r"\b(\d{1,2})[-_](\d{1,2})[-_](20\d{2})\b", stem)
    if m4:
        try:
            dt = datetime(int(m4.group(3)), int(m4.group(2)), int(m4.group(1)))
            return dt, dt.strftime("%d %b %Y")
        except ValueError:
            pass

    return fallback_dt, fallback_dt.strftime("%d %b %Y")


def _resolve_stock_header(candidate: str, held_symbols: Dict[str, dict]) -> Optional[Tuple[str, str]]:
    """
    Given a potential stock heading (e.g. '1. Bharat Electronics Ltd (BEL)', 'HDFC Life', 'Astral Ltd', '2. Mahindra & Mahindra (M&M)'),
    returns (symbol, display_company_name) if it matches a known stock or ticker, else None.
    """
    raw = candidate.strip()
    # Strip leading numbering like "1.", "2)", "Step 1:"
    raw = re.sub(r"^\d+[\.\)\-]\s*", "", raw).strip()
    raw = raw.strip("*_:#- ").strip()
    if not raw or len(raw) > 55:
        return None

    low = raw.lower()

    # 1. Direct alias match
    if low in STOCK_ALIASES:
        sym = STOCK_ALIASES[low]
        return sym, COMPANY_NAME_MAP.get(sym, raw)

    # 2. Check ticker inside parentheses e.g. "Bharat Electronics Ltd (BEL)" or "Mahindra & Mahindra (M&M)"
    paren_m = re.search(r"\(([A-Za-z0-9&\-\.]+)\)", raw)
    if paren_m:
        inside = paren_m.group(1).strip().upper()
        if inside in COMPANY_NAME_MAP or inside in held_symbols:
            return inside, COMPANY_NAME_MAP.get(inside, raw)
        if inside.lower() in STOCK_ALIASES:
            sym = STOCK_ALIASES[inside.lower()]
            return sym, COMPANY_NAME_MAP.get(sym, raw)

    # 3. Exact symbol match (case-insensitive)
    up = raw.upper()
    if up in COMPANY_NAME_MAP or up in held_symbols:
        return up, COMPANY_NAME_MAP.get(up, raw)

    # 4. Strip common corporate suffixes ("Ltd", "Limited", "India", "Industries", "Corp") and check
    stripped_low = re.sub(
        r"\b(ltd\.?|limited|india|industries|corporation|corp\.?|company|enterprises|holdings)\b",
        "",
        low,
    ).strip(" -.,&()")

    if stripped_low in STOCK_ALIASES:
        sym = STOCK_ALIASES[stripped_low]
        return sym, COMPANY_NAME_MAP.get(sym, raw)

    if stripped_low.upper() in COMPANY_NAME_MAP or stripped_low.upper() in held_symbols:
        sym = stripped_low.upper()
        return sym, COMPANY_NAME_MAP.get(sym, raw)

    # 5. Match against COMPANY_NAME_MAP values
    for sym, cname in COMPANY_NAME_MAP.items():
        cname_low = cname.lower()
        cname_clean = re.sub(r"\s*\(.*?\)", "", cname_low).strip()
        if low == cname_low or low == cname_clean or stripped_low == cname_clean:
            return sym, cname

    return None


def _parse_document_stock_sections(lines: List[str], held_symbols: Dict[str, dict]) -> List[dict]:
    """
    Splits a Word/text document's lines into per-stock blocks.
    Supports all layouts used in the user's CNBC Awaaz files:
      - '1. HDFC Bank' followed by bullet lines
      - 'HDFC Life:' followed by bullet lines
      - 'HDFC Life: This is really very good buying...' (inline single-line note)
    """
    blocks: List[dict] = []
    current_block: Optional[dict] = None

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Case 1: Numbered heading e.g. "1. HDFC Bank" or "2. Mahindra & Mahindra (M&M)"
        num_match = re.match(r"^\d+[\.\)]\s+(.+)$", stripped)
        if num_match:
            header_part = num_match.group(1).strip()
            # Check if there's a colon with inline content or just a header
            if ":" in header_part:
                left, right = header_part.split(":", 1)
                resolved = _resolve_stock_header(left, held_symbols)
                if resolved:
                    sym, cname = resolved
                    current_block = {"symbol": sym, "company_name": cname, "points": []}
                    if right.strip():
                        current_block["points"].append(right.strip())
                    blocks.append(current_block)
                    continue
            resolved = _resolve_stock_header(header_part, held_symbols)
            if resolved:
                sym, cname = resolved
            else:
                # Even if not in our map yet, a numbered heading in the user's file is a stock heading
                clean_h = header_part.rstrip(":").strip()
                sym = re.sub(r"[^A-Z0-9&]", "", clean_h.upper())[:16] or clean_h.upper()
                cname = clean_h
            current_block = {"symbol": sym, "company_name": cname, "points": []}
            blocks.append(current_block)
            continue

        # Case 2: Line ends with ':' (e.g., "HDFC Life:", "Astral Ltd:", "Havells India:")
        if stripped.endswith(":"):
            candidate = stripped[:-1].strip()
            resolved = _resolve_stock_header(candidate, held_symbols)
            if resolved:
                sym, cname = resolved
                current_block = {"symbol": sym, "company_name": cname, "points": []}
                blocks.append(current_block)
                continue
            elif len(candidate.split()) <= 4 and current_block is None:
                sym = re.sub(r"[^A-Z0-9&]", "", candidate.upper())[:16]
                current_block = {"symbol": sym, "company_name": candidate, "points": []}
                blocks.append(current_block)
                continue

        # Case 3: Line has "Left: Right" — check if "Left" is a Stock Name (like "HDFC Life: This is really very good buying...")
        if ":" in stripped:
            left, right = stripped.split(":", 1)
            resolved = _resolve_stock_header(left, held_symbols)
            if resolved:
                sym, cname = resolved
                current_block = {"symbol": sym, "company_name": cname, "points": []}
                if right.strip():
                    current_block["points"].append(right.strip())
                blocks.append(current_block)
                continue

        # Case 4: Standalone line that matches a known stock name without a colon
        if len(stripped.split()) <= 5:
            resolved = _resolve_stock_header(stripped, held_symbols)
            if resolved:
                sym, cname = resolved
                current_block = {"symbol": sym, "company_name": cname, "points": []}
                blocks.append(current_block)
                continue

        # Otherwise, it's a content bullet/point under the current stock block
        if current_block is not None:
            clean_point = re.sub(r"^[\•\-\*\u2022]+\s*", "", stripped).strip()
            if clean_point:
                current_block["points"].append(clean_point)

    # Filter out any empty blocks
    return [b for b in blocks if b["points"]]


def _analyze_points_catalyst(points: List[str]) -> Tuple[str, str, str]:
    """
    Determines (category, sentiment, impact_level) from the text points of a stock's news block.
    """
    full_text = " ".join(points).lower()

    matched_cat = None
    cat_scores: Dict[str, int] = {}
    for cat, kw_list in PRICE_IMPACT_KEYWORDS.items():
        for kw in kw_list:
            if kw in full_text:
                cat_scores[cat] = cat_scores.get(cat, 0) + 2

    if cat_scores:
        matched_cat = max(cat_scores.items(), key=lambda x: x[1])[0]
    else:
        matched_cat = "CNBC Awaaz Catalyst"

    bull_hits = sum(1 for w in BULLISH_TERMS if w in full_text)
    bear_hits = sum(1 for w in BEARISH_TERMS if w in full_text)

    if bear_hits > bull_hits:
        sentiment = "BEARISH"
    elif bull_hits > 0:
        sentiment = "BULLISH"
    else:
        sentiment = "NEUTRAL"

    has_numbers = bool(re.search(r"\b\d+(\.\d+)?\s*%|\b₹\s*\d+|\b\d+\s*(cr|crore|lakh|bps|target)\b", full_text))
    impact_level = "HIGH" if (has_numbers or len(points) >= 2 or bull_hits + bear_hits >= 2) else "MEDIUM"

    return matched_cat, sentiment, impact_level


def pull_latest_holdings_news(holdings_rows: List[dict], max_days: int = 7) -> dict:
    """
    Reads all user-curated Word (.docx) and text (.txt/.md) files from:
      C:\\My_work_RA\\Antigravity\\Manual Data\\News
    - Parses the news date from each filename.
    - Extracts stock-specific sections and matches them to NSE symbols & Live Holdings info.
    - Sorts files chronologically so when new files are added for the same stock, their news entries
      are appended below existing entries under that stock card.
    """
    os.makedirs(MANUAL_NEWS_DIR, exist_ok=True)

    # 1. Build Live Holdings lookup map by symbol
    holding_map: Dict[str, dict] = {}
    for h in holdings_rows:
        qty = float(h.get("quantity") or 0)
        if qty <= 0:
            continue
        raw_script = str(h.get("script") or "").strip().upper()
        sym = clean_script_symbol(raw_script)
        if not sym or sym in ETF_AND_NON_EQUITY_SCRIPTS:
            continue

        ltp = float(h.get("ltp") or h.get("avg_price") or 0.0)
        avg_p = float(h.get("avg_price") or 0.0)
        val = qty * ltp
        cost = qty * avg_p
        broker = str(h.get("broker") or "").strip()

        if sym not in holding_map:
            holding_map[sym] = {
                "symbol": sym,
                "company_name": COMPANY_NAME_MAP.get(sym, sym),
                "total_qty": 0.0,
                "total_value": 0.0,
                "total_cost": 0.0,
                "ltp": ltp,
                "ltp_change_pct": float(h.get("ltp_change_pct") or 0.0),
                "brokers": [],
            }
        entry = holding_map[sym]
        entry["total_qty"] += qty
        entry["total_value"] += val
        entry["total_cost"] += cost
        if ltp > 0:
            entry["ltp"] = ltp
        if broker and broker not in entry["brokers"]:
            entry["brokers"].append(broker)

    # 2. Discover all news files in Manual Data/News
    file_entries = []
    for fname in os.listdir(MANUAL_NEWS_DIR):
        if fname.startswith("~$"):
            continue
        fpath = os.path.join(MANUAL_NEWS_DIR, fname)
        if not os.path.isfile(fpath):
            continue
        ext = os.path.splitext(fname)[1].lower()
        if ext not in (".docx", ".txt", ".md"):
            continue

        mtime = os.path.getmtime(fpath)
        file_dt, date_label = _parse_date_from_filename(fname, mtime)
        file_entries.append({
            "filename": fname,
            "filepath": fpath,
            "ext": ext,
            "file_dt": file_dt,
            "date_label": date_label,
            "mtime": mtime,
        })

    # Sort files chronologically (oldest date first, so newer files append below!)
    file_entries.sort(key=lambda x: (x["file_dt"], x["mtime"], x["filename"]))

    # 3. Parse each file and append stock news blocks in chronological order
    stocks_news_map: Dict[str, dict] = {}
    total_entries_count = 0

    for fmeta in file_entries:
        if fmeta["ext"] == ".docx":
            lines = _read_docx_lines(fmeta["filepath"])
        else:
            lines = _read_text_lines(fmeta["filepath"])

        blocks = _parse_document_stock_sections(lines, holding_map)
        for blk in blocks:
            sym = blk["symbol"]
            cname = COMPANY_NAME_MAP.get(sym, blk["company_name"])
            points = blk["points"]
            cat, sentiment, impact_level = _analyze_points_catalyst(points)

            if sym not in stocks_news_map:
                h_info = holding_map.get(sym, {})
                stocks_news_map[sym] = {
                    "symbol": sym,
                    "company_name": cname,
                    "brokers": h_info.get("brokers", []),
                    "total_qty": int(round(h_info.get("total_qty", 0))),
                    "total_value": round(h_info.get("total_value", 0.0), 2),
                    "total_cost": round(h_info.get("total_cost", 0.0), 2),
                    "ltp": round(h_info.get("ltp", 0.0), 2),
                    "ltp_change_pct": round(h_info.get("ltp_change_pct", 0.0), 2),
                    "entries": [],
                }

            # Build a clean title + structured points for this dated file entry
            joined_text = " | ".join(points)
            stocks_news_map[sym]["entries"].append({
                "title": joined_text,
                "points": points,
                "source": os.path.splitext(fmeta["filename"])[0],
                "file_name": fmeta["filename"],
                "link": "",
                "published_at": fmeta["file_dt"].isoformat(),
                "published_date": fmeta["date_label"],
                "age_label": fmeta["date_label"],
                "category": cat,
                "sentiment": sentiment,
                "impact_level": impact_level,
            })
            total_entries_count += 1

    # 4. Build final enriched stock cards
    enriched_stocks = []
    bullish_count = 0
    bearish_count = 0
    high_impact_count = 0

    for sym, st_data in stocks_news_map.items():
        entries = st_data["entries"]
        # Entries are already in chronological order (older file first, newer file appended below)
        latest_entry = entries[-1]

        bull_c = sum(1 for e in entries if e["sentiment"] == "BULLISH")
        bear_c = sum(1 for e in entries if e["sentiment"] == "BEARISH")
        # Latest file's sentiment takes priority on tie
        if bear_c > bull_c:
            overall_sentiment = "BEARISH"
        elif bull_c > bear_c:
            overall_sentiment = "BULLISH"
        else:
            overall_sentiment = latest_entry["sentiment"]

        impact_level = "HIGH" if any(e["impact_level"] == "HIGH" for e in entries) else "MEDIUM"
        primary_catalyst = latest_entry["category"]

        # Build executive summary bullets across entries (if multiple dates exist, prefix with date)
        ai_bullets: List[str] = []
        if len(entries) == 1:
            ai_bullets = list(entries[0]["points"])
        else:
            for e in entries:
                summary_pt = " ".join(e["points"])
                ai_bullets.append(f"[{e['published_date']}] {summary_pt}")

        if overall_sentiment == "BULLISH":
            bullish_count += 1
        elif overall_sentiment == "BEARISH":
            bearish_count += 1
        if impact_level == "HIGH":
            high_impact_count += 1

        pnl_pct = (
            round(((st_data["total_value"] - st_data["total_cost"]) / st_data["total_cost"]) * 100.0, 2)
            if st_data["total_cost"] > 0
            else 0.0
        )

        enriched_stocks.append({
            "symbol": sym,
            "company_name": st_data["company_name"],
            "brokers": st_data["brokers"],
            "total_qty": st_data["total_qty"],
            "total_value": st_data["total_value"],
            "ltp": st_data["ltp"],
            "ltp_change_pct": st_data["ltp_change_pct"],
            "holding_pnl_pct": pnl_pct,
            "overall_sentiment": overall_sentiment,
            "impact_level": impact_level,
            "primary_catalyst": primary_catalyst,
            "ai_summary": " • ".join(ai_bullets),
            "ai_bullets": ai_bullets,
            "article_count": len(entries),
            "latest_published_at": latest_entry["published_at"],
            "latest_age_label": latest_entry["published_date"],
            "articles": entries,
        })

    # Sort by Stock Symbol alphabetically (as requested: "sort it by stock and show it under stock news")
    enriched_stocks.sort(key=lambda x: x["symbol"])

    payload = {
        "last_pulled": datetime.now().isoformat(),
        "window_days": max_days,
        "source_folder": MANUAL_NEWS_DIR,
        "files_processed": [f["filename"] for f in file_entries],
        "llm_engine": "CNBC Awaaz Manual Word Files Parser",
        "summary": {
            "total_held_stocks_scanned": len(file_entries),
            "stocks_with_impact_news": len(enriched_stocks),
            "total_articles_analyzed": total_entries_count,
            "bullish_catalysts": bullish_count,
            "bearish_catalysts": bearish_count,
            "neutral_catalysts": len(enriched_stocks) - bullish_count - bearish_count,
            "high_impact_stocks": high_impact_count,
        },
        "stocks": enriched_stocks,
    }

    try:
        with open(NEWS_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[News Service] Failed to save news cache: {e}")

    return payload


def get_cached_holdings_news() -> dict:
    """
    Returns the latest news report from Manual Data/News (auto-syncing if cache doesn't exist or isn't from Manual Data/News).
    """
    if os.path.exists(NEWS_CACHE_PATH):
        try:
            with open(NEWS_CACHE_PATH, "r", encoding="utf-8") as f:
                cached = json.load(f)
                if cached.get("source_folder"):
                    return cached
        except Exception as e:
            print(f"[News Service] Error reading news cache: {e}")

    return pull_latest_holdings_news([])
