import concurrent.futures
import yfinance as yf
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from models.stock_metadata import StockMetadata
from sqlalchemy.sql import func
import requests
from bs4 import BeautifulSoup
import time
import threading

_screener_lock = threading.Lock()
_screener_session = requests.Session()

# ─── Static Metadata Registry for Active Portfolio Holdings ──────────────────
_STATIC_METADATA_MAP = {
    "ACC-EQ": {
        "company_name": "ACC Ltd",
        "sector": "Infrastructure",
        "industry": "Cement & Cement Products",
        "market_cap": 480000000000.0,
        "market_cap_category": "Large"
    },
    "ASTRAL-EQ": {
        "company_name": "Astral Ltd",
        "sector": "Commodities",
        "industry": "Plastic Pipes & Fitting",
        "market_cap": 500000000000.0,
        "market_cap_category": "Large"
    },
    "BAJAJHFL-EQ": {
        "company_name": "Bajaj Housing Finance Ltd",
        "sector": "Financial Services",
        "industry": "Housing Finance",
        "market_cap": 1200000000000.0,
        "market_cap_category": "Large"
    },
    "BANKBARODA-EQ": {
        "company_name": "Bank of Baroda",
        "sector": "Financial Services",
        "industry": "Banks - Public",
        "market_cap": 1030000000000.0,
        "market_cap_category": "Large"
    },
    "BEL-EQ": {
        "company_name": "Bharat Electronics Ltd",
        "sector": "Industrials",
        "industry": "Defence Electronics",
        "market_cap": 2100000000000.0,
        "market_cap_category": "Large"
    },
    "BHARTIARTL-EQ": {
        "company_name": "Bharti Airtel Ltd",
        "sector": "Telecom",
        "industry": "Telecom - Services",
        "market_cap": 1220000000000.0,
        "market_cap_category": "Large"
    },
    "BRITANNIA-EQ": {
        "company_name": "Britannia Industries Ltd",
        "sector": "FMCG",
        "industry": "Bakery & Dairy Products",
        "market_cap": 1200000000000.0,
        "market_cap_category": "Large"
    },
    "CESC-EQ": {
        "company_name": "CESC Ltd",
        "sector": "Utilities",
        "industry": "Power Generation & Distribution",
        "market_cap": 250000000000.0,
        "market_cap_category": "Large"
    },
    "CIPLA-EQ": {
        "company_name": "Cipla Ltd",
        "sector": "Healthcare",
        "industry": "Pharmaceuticals",
        "market_cap": 1200000000000.0,
        "market_cap_category": "Large"
    },
    "CMSINFO-EQ": {
        "company_name": "CMS Info Systems Ltd",
        "sector": "Services",
        "industry": "Diversified Commercial Services",
        "market_cap": 60000000000.0,
        "market_cap_category": "Mid"
    },
    "COALINDIA-EQ": {
        "company_name": "Coal India Ltd",
        "sector": "Metals & Mining",
        "industry": "Coal Mining",
        "market_cap": 2600000000000.0,
        "market_cap_category": "Large"
    },
    "CONCOR-EQ": {
        "company_name": "Container Corporation of India Ltd",
        "sector": "Services",
        "industry": "Logistics & Transport",
        "market_cap": 500000000000.0,
        "market_cap_category": "Large"
    },
    "DLF-EQ": {
        "company_name": "DLF Ltd",
        "sector": "Real Estate",
        "industry": "Real Estate Developer",
        "market_cap": 2000000000000.0,
        "market_cap_category": "Large"
    },
    "EIDPARRY-EQ": {
        "company_name": "E.I.D. - Parry (India) Ltd",
        "sector": "FMCG",
        "industry": "Sugar & Fertilizers",
        "market_cap": 100000000000.0,
        "market_cap_category": "Mid"
    },
    "FMCGIETF-EQ": {
        "company_name": "ICICI Prudential FMCG ETF",
        "sector": "Others",
        "industry": "ETF",
        "market_cap": 0.0,
        "market_cap_category": "Small"
    },
    "HAVELLS-EQ": {
        "company_name": "Havells India Ltd",
        "sector": "Industrials",
        "industry": "Consumer Electronics & Electricals",
        "market_cap": 790000000000.0,
        "market_cap_category": "Large"
    },
    "HCLTECH-EQ": {
        "company_name": "HCL Technologies Ltd",
        "sector": "Information Technology",
        "industry": "IT Services & Consulting",
        "market_cap": 4000000000000.0,
        "market_cap_category": "Large"
    },
    "HDFCAMC-EQ": {
        "company_name": "HDFC Asset Management Company Ltd",
        "sector": "Financial Services",
        "industry": "Asset Management Company",
        "market_cap": 1090000000000.0,
        "market_cap_category": "Large"
    },
    "HDFCBANK-EQ": {
        "company_name": "HDFC Bank Ltd",
        "sector": "Financial Services",
        "industry": "Banks - Private Sector",
        "market_cap": 11600000000000.0,
        "market_cap_category": "Large"
    },
    "HDFCLIFE-EQ": {
        "company_name": "HDFC Life Insurance Company Ltd",
        "sector": "Financial Services",
        "industry": "Life Insurance",
        "market_cap": 1180000000000.0,
        "market_cap_category": "Large"
    },
    "HEROMOTOCO-EQ": {
        "company_name": "Hero MotoCorp Ltd",
        "sector": "Automobile",
        "industry": "2/3 Wheelers",
        "market_cap": 1060000000000.0,
        "market_cap_category": "Large"
    },
    "HINDCOPPER-EQ": {
        "company_name": "Hindustan Copper Ltd",
        "sector": "Metals & Mining",
        "industry": "Copper Mining",
        "market_cap": 250000000000.0,
        "market_cap_category": "Large"
    },
    "HINDUNILVR-EQ": {
        "company_name": "Hindustan Unilever Ltd",
        "sector": "FMCG",
        "industry": "Household & Personal Products",
        "market_cap": 5500000000000.0,
        "market_cap_category": "Large"
    },
    "HINDZINC-EQ": {
        "company_name": "Hindustan Zinc Ltd",
        "sector": "Metals & Mining",
        "industry": "Zinc & Lead Smelting",
        "market_cap": 2000000000000.0,
        "market_cap_category": "Large"
    },
    "HNGSNGBEES-EQ": {
        "company_name": "Nippon India ETF Hang Seng BeES",
        "sector": "Others",
        "industry": "ETF",
        "market_cap": 0.0,
        "market_cap_category": "Small"
    },
    "ICICIBANK-EQ": {
        "company_name": "ICICI Bank Ltd",
        "sector": "Financial Services",
        "industry": "Banks - Private Sector",
        "market_cap": 10290000000000.0,
        "market_cap_category": "Large"
    },
    "ICICIGI-EQ": {
        "company_name": "ICICI Lombard General Insurance Company Ltd",
        "sector": "Financial Services",
        "industry": "General Insurance",
        "market_cap": 810000000000.0,
        "market_cap_category": "Large"
    },
    "ICICIPRULI-EQ": {
        "company_name": "ICICI Prudential Life Insurance Company Ltd",
        "sector": "Financial Services",
        "industry": "Life Insurance",
        "market_cap": 800000000000.0,
        "market_cap_category": "Large"
    },
    "ICRA-EQ": {
        "company_name": "ICRA Ltd",
        "sector": "Financial Services",
        "industry": "Credit Rating Agency",
        "market_cap": 60000000000.0,
        "market_cap_category": "Mid"
    },
    "IGIL-EQ": {
        "company_name": "International Gemological Institute India Ltd",
        "sector": "Services",
        "industry": "Gemological Services",
        "market_cap": 15000000000.0,
        "market_cap_category": "Small"
    },
    "IGL-EQ": {
        "company_name": "Indraprastha Gas Ltd",
        "sector": "Energy",
        "industry": "City Gas Distribution",
        "market_cap": 300000000000.0,
        "market_cap_category": "Large"
    },
    "INDHOTEL-EQ": {
        "company_name": "The Indian Hotels Company Ltd",
        "sector": "Consumer Discretionary",
        "industry": "Hotels & Resorts",
        "market_cap": 800000000000.0,
        "market_cap_category": "Large"
    },
    "INDRAMEDCO-EQ": {
        "company_name": "Indraprastha Medical Corporation Ltd",
        "sector": "Healthcare",
        "industry": "Hospitals",
        "market_cap": 15000000000.0,
        "market_cap_category": "Small"
    },
    "INFY-EQ": {
        "company_name": "Infosys Ltd",
        "sector": "Information Technology",
        "industry": "IT Services & Consulting",
        "market_cap": 6800000000000.0,
        "market_cap_category": "Large"
    },
    "IOC-EQ": {
        "company_name": "Indian Oil Corporation Ltd",
        "sector": "Energy",
        "industry": "Oil & Gas Refining & Marketing",
        "market_cap": 1970000000000.0,
        "market_cap_category": "Large"
    },
    "IRCTC-EQ": {
        "company_name": "Indian Railway Catering & Tourism Corporation Ltd",
        "sector": "Consumer Discretionary",
        "industry": "Travel & Tourism Services",
        "market_cap": 750000000000.0,
        "market_cap_category": "Large"
    },
    "IREDA-EQ": {
        "company_name": "Indian Renewable Energy Development Agency Ltd",
        "sector": "Financial Services",
        "industry": "Financial Institution",
        "market_cap": 336000000000.0,
        "market_cap_category": "Large"
    },
    "IRFC-EQ": {
        "company_name": "Indian Railway Finance Corporation Ltd",
        "sector": "Financial Services",
        "industry": "Non Banking Financial Company (NBFC)",
        "market_cap": 2000000000000.0,
        "market_cap_category": "Large"
    },
    "ITC-EQ": {
        "company_name": "ITC Ltd",
        "sector": "FMCG",
        "industry": "Cigarettes & Diversified FMCG",
        "market_cap": 6000000000000.0,
        "market_cap_category": "Large"
    },
    "ITIETF-EQ": {
        "company_name": "ITI ETF Nifty Bank",
        "sector": "Others",
        "industry": "ETF",
        "market_cap": 0.0,
        "market_cap_category": "Small"
    },
    "JIOFIN-EQ": {
        "company_name": "Jio Financial Services Ltd",
        "sector": "Financial Services",
        "industry": "Non Banking Financial Company (NBFC)",
        "market_cap": 162000000000.0,
        "market_cap_category": "Large"
    },
    "JWL-EQ": {
        "company_name": "Jupiter Wagons Ltd",
        "sector": "Industrials",
        "industry": "Railway Wagons",
        "market_cap": 110000000000.0,
        "market_cap_category": "Mid"
    },
    "KAYNES-EQ": {
        "company_name": "Kaynes Technology India Ltd",
        "sector": "Industrials",
        "industry": "Electronics Manufacturing Services",
        "market_cap": 180000000000.0,
        "market_cap_category": "Large"
    },
    "KFINTECH-EQ": {
        "company_name": "KFin Technologies Ltd",
        "sector": "Financial Services",
        "industry": "Financial Technology",
        "market_cap": 120000000000.0,
        "market_cap_category": "Mid"
    },
    "KOTAKBANK-EQ": {
        "company_name": "Kotak Mahindra Bank Ltd",
        "sector": "Financial Services",
        "industry": "Banks - Private Sector",
        "market_cap": 3500000000000.0,
        "market_cap_category": "Large"
    },
    "KPITTECH-EQ": {
        "company_name": "KPIT Technologies Ltd",
        "sector": "Information Technology",
        "industry": "IT Services & Consulting",
        "market_cap": 160000000000.0,
        "market_cap_category": "Mid"
    },
    "KRSNAA-EQ": {
        "company_name": "Krsnaa Diagnostics Ltd",
        "sector": "Healthcare",
        "industry": "Diagnostic Services",
        "market_cap": 20000000000.0,
        "market_cap_category": "Small"
    },
    "KWIL-EQ": {
        "company_name": "Kewal Kiran Clothing Ltd",
        "sector": "Consumer Discretionary",
        "industry": "Garments & Apparels",
        "market_cap": 45000000000.0,
        "market_cap_category": "Small"
    },
    "LIQUIDBEES-EQ": {
        "company_name": "Nippon India ETF Nifty 1D Rate Liquid BeES",
        "sector": "Others",
        "industry": "ETF",
        "market_cap": 0.0,
        "market_cap_category": "Small"
    },
    "LT-EQ": {
        "company_name": "Larsen & Toubro Ltd",
        "sector": "Industrials",
        "industry": "Engineering & Construction",
        "market_cap": 4800000000000.0,
        "market_cap_category": "Large"
    },
    "M&M-EQ": {
        "company_name": "Mahindra & Mahindra Ltd",
        "sector": "Automobile",
        "industry": "Commercial Vehicles & SUVs",
        "market_cap": 3200000000000.0,
        "market_cap_category": "Large"
    },
    "MARUTI-EQ": {
        "company_name": "Maruti Suzuki India Ltd",
        "sector": "Automobile",
        "industry": "Passenger Cars",
        "market_cap": 3800000000000.0,
        "market_cap_category": "Large"
    },
    "MAZDOCK-EQ": {
        "company_name": "Mazagon Dock Shipbuilders Ltd",
        "sector": "Industrials",
        "industry": "Shipbuilding & Marine",
        "market_cap": 400000000000.0,
        "market_cap_category": "Large"
    },
    "MUTHOOTFIN-EQ": {
        "company_name": "Muthoot Finance Ltd",
        "sector": "Financial Services",
        "industry": "Non Banking Financial Company (NBFC)",
        "market_cap": 700000000000.0,
        "market_cap_category": "Large"
    },
    "NCC-EQ": {
        "company_name": "NCC Ltd",
        "sector": "Industrials",
        "industry": "Construction & Infrastructure",
        "market_cap": 150000000000.0,
        "market_cap_category": "Mid"
    },
    "NTPC-EQ": {
        "company_name": "NTPC Ltd",
        "sector": "Utilities",
        "industry": "Power Generation",
        "market_cap": 3500000000000.0,
        "market_cap_category": "Large"
    },
    "NTPCGREEN-EQ": {
        "company_name": "NTPC Green Energy Ltd",
        "sector": "Utilities",
        "industry": "Power Generation",
        "market_cap": 763840000000.0,
        "market_cap_category": "Large"
    },
    "PATELENG-EQ": {
        "company_name": "Patel Engineering Ltd",
        "sector": "Industrials",
        "industry": "Infrastructure Construction",
        "market_cap": 50000000000.0,
        "market_cap_category": "Small"
    },
    "PERSISTENT-EQ": {
        "company_name": "Persistent Systems Ltd",
        "sector": "Information Technology",
        "industry": "IT Services & Consulting",
        "market_cap": 800000000000.0,
        "market_cap_category": "Large"
    },
    "PETRONET-EQ": {
        "company_name": "Petronet LNG Ltd",
        "sector": "Energy",
        "industry": "Oil & Gas LNG Terminals",
        "market_cap": 450000000000.0,
        "market_cap_category": "Large"
    },
    "PIIND-EQ": {
        "company_name": "PI Industries Ltd",
        "sector": "Chemicals",
        "industry": "Agrochemicals",
        "market_cap": 550000000000.0,
        "market_cap_category": "Large"
    },
    "PNB-EQ": {
        "company_name": "Punjab National Bank",
        "sector": "Financial Services",
        "industry": "Banks - Public Sector",
        "market_cap": 1200000000000.0,
        "market_cap_category": "Large"
    },
    "POWERGRID-EQ": {
        "company_name": "Power Grid Corporation of India Ltd",
        "sector": "Utilities",
        "industry": "Power Transmission",
        "market_cap": 2800000000000.0,
        "market_cap_category": "Large"
    },
    "RECLTD-EQ": {
        "company_name": "REC Ltd",
        "sector": "Financial Services",
        "industry": "Non Banking Financial Company (NBFC)",
        "market_cap": 1500000000000.0,
        "market_cap_category": "Large"
    },
    "RELIANCE-EQ": {
        "company_name": "Reliance Industries Ltd",
        "sector": "Energy",
        "industry": "Oil & Gas Refining & Marketing",
        "market_cap": 17494840000000.0,
        "market_cap_category": "Large"
    },
    "SGBAUG28V-GB-EQ": {
        "company_name": "Sovereign Gold Bond 2.50% Aug 2028 Series V",
        "sector": "Others",
        "industry": "Sovereign Gold Bond",
        "market_cap": 0.0,
        "market_cap_category": "Small"
    },
    "SILVERBEES-EQ": {
        "company_name": "Nippon India ETF Silver BeES",
        "sector": "Others",
        "industry": "ETF",
        "market_cap": 0.0,
        "market_cap_category": "Small"
    },
    "SMALLCAP-EQ": {
        "company_name": "Mirae Asset Nifty Smallcap 250 Momentum Quality 100 ETF",
        "sector": "Others",
        "industry": "ETF",
        "market_cap": 0.0,
        "market_cap_category": "Small"
    },
    "SRF-EQ": {
        "company_name": "SRF Ltd",
        "sector": "Commodities",
        "industry": "Chemicals & Packaging",
        "market_cap": 700000000000.0,
        "market_cap_category": "Large"
    },
    "SULA-EQ": {
        "company_name": "Sula Vineyards Ltd",
        "sector": "FMCG",
        "industry": "Wine Producer",
        "market_cap": 14190000000.0,
        "market_cap_category": "Small"
    },
    "TARIL-EQ": {
        "company_name": "Transformers and Rectifiers (India) Ltd",
        "sector": "Industrials",
        "industry": "Transformers & Electricals",
        "market_cap": 80000000000.0,
        "market_cap_category": "Mid"
    },
    "TATAPOWER-EQ": {
        "company_name": "Tata Power Company Ltd",
        "sector": "Utilities",
        "industry": "Integrated Power Utilities",
        "market_cap": 1202080000000.0,
        "market_cap_category": "Large"
    },
    "TCS-EQ": {
        "company_name": "Tata Consultancy Services Ltd",
        "sector": "Information Technology",
        "industry": "Computers - Software & Consulting",
        "market_cap": 8802060000000.0,
        "market_cap_category": "Large"
    },
    "TMPV-EQ": {
        "company_name": "Tata Motors Passenger Vehicles Ltd",
        "sector": "Automobile",
        "industry": "Passenger Cars",
        "market_cap": 40000000000.0,
        "market_cap_category": "Small"
    },
    "TRENT-EQ": {
        "company_name": "Trent Ltd",
        "sector": "Consumer Discretionary",
        "industry": "Retail - Apparel",
        "market_cap": 2500000000000.0,
        "market_cap_category": "Large"
    },
    "UBL-EQ": {
        "company_name": "United Breweries Ltd",
        "sector": "FMCG",
        "industry": "Breweries & Distilleries",
        "market_cap": 380120000000.0,
        "market_cap_category": "Large"
    },
    "UNITDSPR-EQ": {
        "company_name": "United Spirits Ltd",
        "sector": "FMCG",
        "industry": "Breweries & Distilleries",
        "market_cap": 1114820000000.0,
        "market_cap_category": "Large"
    },
    "UNOMINDA-EQ": {
        "company_name": "Uno Minda Ltd",
        "sector": "Automobile",
        "industry": "Auto Components & Equipments",
        "market_cap": 677310000000.0,
        "market_cap_category": "Large"
    },
    "WAAREEENER-EQ": {
        "company_name": "Waaree Energies Ltd",
        "sector": "Industrials",
        "industry": "Other Electrical Equipment",
        "market_cap": 754560000000.0,
        "market_cap_category": "Large"
    }
}


def _clean_symbol(scrip: str) -> str:
    """Strip exchange suffixes like -EQ, -BE, etc."""
    for suffix in ["-EQ", "-BE", "-BL", "-BZ", "-GB"]:
        if scrip.endswith(suffix):
            return scrip[:-len(suffix)].strip().upper()
    return scrip.strip().upper()


def _classify_market_cap(market_cap: float) -> str:
    """Classify market cap into Large / Mid / Small based on INR thresholds."""
    if market_cap >= 200_000_000_000:   # ≥ 20,000 Cr
        return "Large"
    elif market_cap >= 50_000_000_000:  # ≥ 5,000 Cr
        return "Mid"
    return "Small"


# ─── Primary Source: Screener.in ─────────────────────────────────────────────

def _scrape_screener(symbol: str) -> dict | None:
    """
    Scrape company name, market cap, sector and industry from screener.in.
    Returns dict on success, None on failure.
    """
    clean = _clean_symbol(symbol)
    url = f"https://www.screener.in/company/{clean}/"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                       'AppleWebKit/537.36 (KHTML, like Gecko) '
                       'Chrome/120.0.0.0 Safari/537.36'
    }

    try:
        with _screener_lock:
            # Serialized spacing between requests
            time.sleep(0.35)
            resp = _screener_session.get(url, headers=headers, timeout=8)
        if resp.status_code != 200:
            print(f"  [Screener] Status {resp.status_code} for {clean}", flush=True)
            return None

        soup = BeautifulSoup(resp.text, 'html.parser')

        # ── Company Name ──
        h1 = soup.find('h1')
        company_name = h1.text.strip() if h1 else clean

        # ── Market Cap (INR) ──
        market_cap = 0.0
        for span in soup.find_all('span', class_='name'):
            if "market cap" in span.text.lower():
                parent_li = span.find_parent('li')
                if parent_li:
                    num_span = parent_li.find('span', class_='number')
                    if num_span:
                        try:
                            val_str = num_span.text.replace(',', '').strip()
                            market_cap = float(val_str) * 10_000_000  # Cr → INR
                        except ValueError:
                            pass
                break

        # ── Sector & Industry (from Peer Comparison header) ──
        sector = "Others"
        industry = "Others"

        for div in soup.find_all('div', class_='flex-space-between'):
            text = div.get_text()
            if "peer comparison" in text.lower():
                parts = [p.strip() for p in text.split('\n') if p.strip()]
                skip = {"part of", "peer comparison", "columns", "edit columns",
                        "export", "setting", "settings", "add to screen",
                        "edit", "show all"}
                parts_clean = [p for p in parts
                               if p.lower() not in skip
                               and "part of" not in p.lower()
                               and not p.startswith("BSE ")
                               and not p.startswith("Nifty ")
                               and not p.startswith("NIFTY ")]
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
            "market_cap": market_cap,
            "sector": sector,
            "industry": industry,
        }
    except Exception as e:
        print(f"  [Screener] Error for {clean}: {e}")
        return None


# ─── Fallback Source: Yahoo Finance ──────────────────────────────────────────

def _fetch_yfinance(symbol: str) -> dict | None:
    """
    Fallback: fetch metadata from Yahoo Finance.
    Returns dict on success, None on failure.
    """
    clean = _clean_symbol(symbol)
    yf_symbol = f"{clean}.NS"
    try:
        time.sleep(0.1)
        ticker = yf.Ticker(yf_symbol)
        info = ticker.info
        if info and "sector" in info:
            sector = info.get("sector") or "Others"
            industry = info.get("industry") or "Others"
            market_cap = float(info.get("marketCap") or info.get("enterpriseValue") or 0)
            beta = info.get("beta")
            company_name = info.get("longName") or info.get("shortName") or clean
            return {
                "company_name": company_name,
                "market_cap": market_cap,
                "sector": sector,
                "industry": industry,
                "beta": float(beta) if beta is not None else None,
            }
    except Exception as e:
        print(f"  [Yahoo] Error for {yf_symbol}: {e}")
    return None


# ─── Orchestrator: fetch one ticker ─────────────────────────────────────────

def fetch_single_ticker_metadata(scrip: str) -> dict:
    """
    Fetches metadata for a single scrip.
    Priority: Static Map → Screener.in → Yahoo Finance → hard defaults.
    """
    # 0. Check static registry first for 100% reliability and speed
    clean_key = scrip.strip().upper()
    if clean_key in _STATIC_METADATA_MAP:
        static = _STATIC_METADATA_MAP[clean_key]
        return {
            "symbol": scrip,
            "company_name": static["company_name"],
            "sector": static["sector"],
            "industry": static["industry"],
            "market_cap": static["market_cap"],
            "market_cap_category": static["market_cap_category"],
            "beta": None,
        }

    # 1. Try Screener.in next
    screener = _scrape_screener(scrip)
    yf_data = None

    if screener and screener["sector"] != "Others" and screener["market_cap"] > 0:
        market_cap = screener["market_cap"]
        return {
            "symbol": scrip,
            "company_name": screener["company_name"],
            "sector": screener["sector"],
            "industry": screener["industry"],
            "market_cap": market_cap,
            "market_cap_category": _classify_market_cap(market_cap),
            "beta": None,
        }

    # 2. Screener failed or returned partial data — try Yahoo Finance
    yf_data = _fetch_yfinance(scrip)
    if yf_data:
        market_cap = yf_data["market_cap"]
        return {
            "symbol": scrip,
            "company_name": yf_data["company_name"],
            "sector": yf_data["sector"],
            "industry": yf_data["industry"],
            "market_cap": market_cap,
            "market_cap_category": _classify_market_cap(market_cap),
            "beta": yf_data.get("beta"),
        }

    # 3. Both failed — use whatever Screener returned (may be partial)
    if screener:
        market_cap = screener["market_cap"]
        return {
            "symbol": scrip,
            "company_name": screener["company_name"],
            "sector": screener["sector"],
            "industry": screener["industry"],
            "market_cap": market_cap,
            "market_cap_category": _classify_market_cap(market_cap),
            "beta": None,
        }

    # 4. Ultimate fallback
    clean = _clean_symbol(scrip)
    return {
        "symbol": scrip,
        "company_name": clean,
        "sector": "Others",
        "industry": "Others",
        "market_cap": 0.0,
        "market_cap_category": "Small",
        "beta": None,
    }


# ─── DB-level cache orchestrator ─────────────────────────────────────────────

def get_or_fetch_stock_metadata(db: Session, scrips: list, force_refresh: bool = False) -> dict:
    """
    Returns a dict mapping scrip → StockMetadata ORM object.
    Fetches missing / stale entries in parallel and caches them in the DB.
    Cache freshness: 1 day.
    """
    if not scrips:
        return {}

    now = datetime.now(timezone.utc)
    freshness_threshold = now - timedelta(days=1)  # daily refresh

    # Load cached rows
    cached_metadata = db.query(StockMetadata).filter(StockMetadata.symbol.in_(scrips)).all()
    cached_map = {m.symbol: m for m in cached_metadata}

    missing_or_stale = []
    for scrip in scrips:
        if force_refresh or scrip not in cached_map:
            missing_or_stale.append(scrip)
        else:
            lu = cached_map[scrip].last_updated
            if lu is not None:
                if lu.tzinfo is None:
                    lu = lu.replace(tzinfo=timezone.utc)
                if lu < freshness_threshold:
                    missing_or_stale.append(scrip)
            else:
                missing_or_stale.append(scrip)

    if missing_or_stale:
        max_workers = min(len(missing_or_stale), 5)
        fetched_results = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_map = {executor.submit(fetch_single_ticker_metadata, s): s
                          for s in missing_or_stale}
            total_missing = len(missing_or_stale)
            completed_count = 0
            for future in concurrent.futures.as_completed(future_map):
                scrip = future_map[future]
                completed_count += 1
                try:
                    res = future.result()
                    fetched_results[scrip] = res
                    print(f"  [Progress] Sync {completed_count}/{total_missing}: {scrip} - {res.get('company_name')} - Sector: {res.get('sector')} - Cap: {res.get('market_cap_category')}", flush=True)
                except Exception as e:
                    print(f"  [ThreadPool] Error for {scrip}: {e}", flush=True)

        # Upsert into DB
        for scrip, data in fetched_results.items():
            meta = cached_map.get(scrip)
            if meta:
                meta.company_name = data["company_name"]
                meta.sector = data["sector"]
                meta.industry = data["industry"]
                meta.market_cap = data["market_cap"]
                meta.market_cap_category = data["market_cap_category"]
                meta.beta = data["beta"]
                meta.last_updated = func.now()
            else:
                meta = StockMetadata(
                    symbol=data["symbol"],
                    company_name=data["company_name"],
                    sector=data["sector"],
                    industry=data["industry"],
                    market_cap=data["market_cap"],
                    market_cap_category=data["market_cap_category"],
                    beta=data["beta"],
                )
                db.add(meta)
                cached_map[scrip] = meta

        try:
            db.commit()
            for scrip in missing_or_stale:
                if scrip in cached_map:
                    db.refresh(cached_map[scrip])
        except Exception as db_err:
            db.rollback()
            print(f"  [DB] Error saving metadata: {db_err}")

    return cached_map
