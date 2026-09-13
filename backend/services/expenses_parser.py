import os
import re
import pandas as pd
from typing import Dict, Any


# ─────────────────────────────────────────────────────────────
# MStock Parsers
# ─────────────────────────────────────────────────────────────

def parse_mstock_ledger(file_path: str) -> Dict[str, Dict[str, float]]:
    """
    Parse the MStock ledger file to extract monthly aggregates for:
    - MTF Interest (Debit)
    - DP Charges (Debit)
    - MTF Position (outstanding balance at the end of the month)
    
    Returns: { 'YYYY-MM': { 'mtf_interest': float, 'dp_charges': float, 'mtf_position': float }, ... }
    """
    if not os.path.exists(file_path):
        return {}
        
    try:
        df = pd.read_excel(file_path, sheet_name="Ledger Report")
    except Exception:
        return {}
        
    # Find the header row
    header_idx = None
    for idx, row in df.iterrows():
        if row.iloc[0] == 'Date' and row.iloc[1] == 'Description':
            header_idx = idx
            break
            
    if header_idx is None:
        return {}
        
    df.columns = df.iloc[header_idx]
    df = df.iloc[header_idx + 1:]
    
    df = df.dropna(subset=['Description'])
    df['Date'] = df['Date'].astype(str).str.strip()
    df['Description'] = df['Description'].astype(str).str.strip()
    
    df['Credit (in Rs.)'] = pd.to_numeric(df['Credit (in Rs.)'], errors='coerce').fillna(0.0)
    df['Debit (in Rs.)'] = pd.to_numeric(df['Debit (in Rs.)'], errors='coerce').fillna(0.0)
    
    # Parse Date into YYYY-MM
    months = []
    for val in df['Date']:
        try:
            parts = val.split('-')
            if len(parts) == 3:
                months.append(f"{parts[2]}-{parts[1]}")
            else:
                months.append(None)
        except Exception:
            months.append(None)
    df['Month'] = months
    df = df.dropna(subset=['Month'])
    
    # Identify segments
    mtf_interest_df = df[df['Description'].str.contains("MTF Interest", case=False, na=False)].copy()
    dp_charges_df = df[df['Description'].str.contains("Dp Transaction charges", case=False, na=False)].copy()
    
    # Extract MTF positions (outstanding amount at end of month)
    mtf_positions = {}
    for m in df['Month'].unique():
        m_rows = mtf_interest_df[mtf_interest_df['Month'] == m]
        if not m_rows.empty:
            # Find the latest transaction in the month
            row_list = []
            for idx, r in m_rows.iterrows():
                parts = r['Date'].split('-')
                if len(parts) == 3:
                    row_list.append((int(parts[2]), int(parts[1]), int(parts[0]), r['Description']))
            if row_list:
                row_list.sort(key=lambda x: (x[0], x[1], x[2]), reverse=True)
                latest_desc = row_list[0][3]
                match = re.search(r'On Amount Rs\s*([\d\.]+)', latest_desc)
                if match:
                    mtf_positions[m] = float(match.group(1))
                    
    # Summarize month-wise
    interest_sums = {}
    for m in mtf_interest_df['Month'].unique():
        interest_sums[m] = float(mtf_interest_df[mtf_interest_df['Month'] == m]['Debit (in Rs.)'].sum())
        
    dp_sums = {}
    for m in dp_charges_df['Month'].unique():
        dp_sums[m] = float(dp_charges_df[dp_charges_df['Month'] == m]['Debit (in Rs.)'].sum())
        
    result = {}
    for m in df['Month'].unique():
        result[m] = {
            "mtf_interest": round(interest_sums.get(m, 0.0), 2),
            "dp_charges": round(dp_sums.get(m, 0.0), 2),
            "mtf_position": round(mtf_positions.get(m, 0.0), 2)
        }
    return result

def parse_mstock_tax_pnl(file_path: str) -> Dict[str, Dict[str, float]]:
    """
    Parse the MStock Tax P&L file's EQUITY sheet to extract monthly:
    - Brokerage
    - Tax + Other Charges + Total STT
    
    Returns: { 'YYYY-MM': { 'brokerage': float, 'tax_other_stt': float }, ... }
    """
    if not os.path.exists(file_path):
        return {}
        
    try:
        df_eq = pd.read_excel(file_path, sheet_name="EQUITY")
    except Exception:
        return {}
        
    header_idx = None
    for idx, row in df_eq.iterrows():
        if row.iloc[0] == 'Scrip Name' and row.iloc[6] == 'Sell Date':
            header_idx = idx
            break
            
    if header_idx is None:
        return {}
        
    df_eq.columns = df_eq.iloc[header_idx]
    df_eq = df_eq.iloc[header_idx + 1:]
    
    df_eq = df_eq.dropna(subset=['Sell Date'])
    df_eq['Sell Date'] = df_eq['Sell Date'].astype(str).str.strip()
    df_eq = df_eq[df_eq['Sell Date'] != 'Sell Date']
    df_eq = df_eq[df_eq['Sell Date'] != 'nan']
    df_eq = df_eq[df_eq['Sell Date'] != '']
    df_eq = df_eq[~df_eq['Sell Date'].str.contains('TOTAL', case=False, na=False)]
    
    months = []
    for val in df_eq['Sell Date']:
        try:
            parts = val.split('-')
            if len(parts) == 3:
                months.append(f"{parts[2]}-{parts[1]}")
            else:
                months.append(None)
        except Exception:
            months.append(None)
            
    df_eq['Month'] = months
    df_eq = df_eq.dropna(subset=['Month'])
    
    df_eq['Brokerage'] = pd.to_numeric(df_eq['Brokerage'], errors='coerce').fillna(0.0)
    df_eq['Tax + Other Charges'] = pd.to_numeric(df_eq['Tax + Other Charges'], errors='coerce').fillna(0.0)
    df_eq['Total STT'] = pd.to_numeric(df_eq['Total STT'], errors='coerce').fillna(0.0)
    
    grouped = df_eq.groupby('Month').agg({
        'Brokerage': 'sum',
        'Tax + Other Charges': 'sum',
        'Total STT': 'sum'
    }).reset_index()
    
    result = {}
    for _, row in grouped.iterrows():
        m = row['Month']
        result[m] = {
            "brokerage": round(float(row['Brokerage']), 2),
            "tax_other_stt": round(float(row['Tax + Other Charges'] + row['Total STT']), 2)
        }
    return result


# ─────────────────────────────────────────────────────────────
# Zerodha Parsers
# ─────────────────────────────────────────────────────────────

def _parse_posting_date_to_month(date_str: str) -> str | None:
    """
    Convert a Zerodha posting date (either 'DD-MM-YYYY' or 'YYYY-MM-DD') to 'YYYY-MM'.
    """
    s = str(date_str).strip()
    try:
        # Format: YYYY-MM-DD
        if len(s) == 10 and s[4] == '-' and s[7] == '-':
            return s[:7]   # already 'YYYY-MM'
        # Format: DD-MM-YYYY
        parts = s.split('-')
        if len(parts) == 3 and len(parts[2]) == 4:
            return f"{parts[2]}-{parts[1]}"
    except Exception:
        pass
    return None


def parse_zerodha_other_debits(file_path: str) -> Dict[str, Dict[str, float]]:
    """
    Parse Zerodha taxpnl xlsx — 'Other Debits and Credits' tab — to extract monthly:
    - MTF Interest  : rows where 'Particulars' starts with 'Interest' (and contains 'MTF')
    - DP Charges    : rows where 'Particulars' starts with 'DP charges for'
    - Pledge Charges: rows where 'Particulars' contains 'pledge'

    'Posting Date' column is used as the expense date.

    Returns: { 'YYYY-MM': { 'mtf_interest': float, 'dp_charges': float, 'pledge_charges': float }, ... }
    """
    if not os.path.exists(file_path):
        return {}

    try:
        df = pd.read_excel(file_path, sheet_name="Other Debits and Credits", header=None)
    except Exception:
        return {}

    # Find the header row containing 'Particulars'
    header_idx = None
    for idx, row in df.iterrows():
        row_vals = [str(v) for v in row.values]
        if any('Particulars' in v for v in row_vals):
            header_idx = idx
            break

    if header_idx is None:
        return {}

    df.columns = df.iloc[header_idx]
    df = df.iloc[header_idx + 1:].copy()

    # Normalise column names – they may be named differently due to unnamed cols
    # Columns are roughly: [NaN, Particulars, Posting Date, Debit, Credit]
    # Re-map positionally to be safe
    cols = list(df.columns)
    # Find index of 'Particulars'
    particulars_idx = next((i for i, c in enumerate(cols) if str(c).strip() == 'Particulars'), None)
    if particulars_idx is None:
        return {}

    posting_date_idx = particulars_idx + 1
    debit_idx = particulars_idx + 2

    if posting_date_idx >= len(cols) or debit_idx >= len(cols):
        return {}

    particulars_col = cols[particulars_idx]
    posting_date_col = cols[posting_date_idx]
    debit_col = cols[debit_idx]

    # Drop rows where Particulars is NaN or not a meaningful string
    df = df.dropna(subset=[particulars_col])
    df[particulars_col] = df[particulars_col].astype(str).str.strip()
    df = df[df[particulars_col].str.len() > 0]
    df = df[df[particulars_col] != 'nan']

    # Parse debit amounts
    df['_debit'] = pd.to_numeric(df[debit_col], errors='coerce').fillna(0.0)

    # Parse posting date → Month
    df['_month'] = df[posting_date_col].apply(
        lambda v: _parse_posting_date_to_month(str(v))
    )
    df = df.dropna(subset=['_month'])

    # ── Classify rows ──────────────────────────────────────────
    # MTF Interest: starts with "Interest" AND contains "MTF"
    mtf_mask = (
        df[particulars_col].str.startswith('Interest', na=False) &
        df[particulars_col].str.contains('MTF', case=False, na=False)
    )
    # DP Charges: starts with "DP charges for" (case-insensitive)
    dp_mask = df[particulars_col].str.lower().str.startswith('dp charges for', na=False)
    # Pledge Charges: contains 'pledge' anywhere (case-insensitive)
    pledge_mask = df[particulars_col].str.contains('pledge', case=False, na=False)

    mtf_df    = df[mtf_mask].copy()
    dp_df     = df[dp_mask].copy()
    pledge_df = df[pledge_mask].copy()

    # Aggregate per month
    def _month_sum(frame: pd.DataFrame) -> Dict[str, float]:
        if frame.empty:
            return {}
        return frame.groupby('_month')['_debit'].sum().to_dict()

    mtf_sums    = _month_sum(mtf_df)
    dp_sums     = _month_sum(dp_df)
    pledge_sums = _month_sum(pledge_df)

    all_months = set(df['_month'].unique())
    result: Dict[str, Dict[str, float]] = {}
    for m in all_months:
        result[m] = {
            "mtf_interest":   round(float(mtf_sums.get(m, 0.0)), 2),
            "dp_charges":     round(float(dp_sums.get(m, 0.0)), 2),
            "pledge_charges": round(float(pledge_sums.get(m, 0.0)), 2),
        }
    return result


def parse_zerodha_tradewise(file_path: str) -> Dict[str, Dict[str, float]]:
    """
    Parse Zerodha taxpnl xlsx — first sheet 'Tradewise Exits from ...' — to extract monthly:
    - Brokerage
    - STT  (column 'STT')

    'Exit Date' is used as the expense date.

    Returns: { 'YYYY-MM': { 'brokerage': float, 'tax_stt': float }, ... }
    """
    if not os.path.exists(file_path):
        return {}

    try:
        xl = pd.ExcelFile(file_path)
        first_sheet = xl.sheet_names[0]
        df = pd.read_excel(file_path, sheet_name=first_sheet, header=None)
    except Exception:
        return {}

    # Find the header row containing 'Symbol' and 'Exit Date'
    header_idx = None
    for idx, row in df.iterrows():
        row_vals = [str(v) for v in row.values]
        if 'Symbol' in row_vals and 'Exit Date' in row_vals:
            header_idx = idx
            break

    if header_idx is None:
        return {}

    df.columns = df.iloc[header_idx]
    df = df.iloc[header_idx + 1:].copy()

    # Drop rows without a valid Exit Date
    df = df.dropna(subset=['Exit Date'])
    df['Exit Date'] = df['Exit Date'].astype(str).str.strip()
    df = df[df['Exit Date'] != 'nan']
    df = df[df['Exit Date'] != '']
    df = df[~df['Exit Date'].str.contains('Exit Date|Equity|TOTAL', case=False, na=True)]

    # Parse Exit Date → Month (format is YYYY-MM-DD in both files)
    df['_month'] = df['Exit Date'].apply(
        lambda v: _parse_posting_date_to_month(str(v))
    )
    df = df.dropna(subset=['_month'])

    df['Brokerage'] = pd.to_numeric(df['Brokerage'], errors='coerce').fillna(0.0)
    df['STT']       = pd.to_numeric(df['STT'],       errors='coerce').fillna(0.0)

    grouped = df.groupby('_month').agg({'Brokerage': 'sum', 'STT': 'sum'}).reset_index()

    result: Dict[str, Dict[str, float]] = {}
    for _, row in grouped.iterrows():
        m = row['_month']
        result[m] = {
            "brokerage": round(float(row['Brokerage']), 2),
            "tax_stt":   round(float(row['STT']), 2),
        }
    return result


def parse_zerodha_interest_statement(file_path: str) -> Dict[str, float]:
    """
    Parse a Zerodha 'RIM544 - Interest Statement' CSV to derive month-end MTF Loan Position.

    Logic (same as MStock): for each month take the 'Funded amount' of the LAST day
    (highest posting date) in that month, which represents the outstanding loan.

    Date formats handled: 'DD-MM-YYYY' and 'YYYY-MM-DD'.

    Returns: { 'YYYY-MM': funded_amount_on_last_day, ... }
    """
    if not os.path.exists(file_path):
        return {}

    try:
        df = pd.read_csv(file_path)
    except Exception:
        return {}

    # Normalise column names (strip whitespace)
    df.columns = [str(c).strip() for c in df.columns]
    required = {'Posting date', 'Funded amount'}
    if not required.issubset(set(df.columns)):
        return {}

    df['Posting date'] = df['Posting date'].astype(str).str.strip()
    df['Funded amount'] = pd.to_numeric(df['Funded amount'], errors='coerce')
    df = df.dropna(subset=['Funded amount'])

    # Parse to full date for sorting
    def _to_date_tuple(s: str):
        """Return (year, month, day) tuple for sorting."""
        try:
            # YYYY-MM-DD
            if len(s) == 10 and s[4] == '-':
                y, mo, d = int(s[0:4]), int(s[5:7]), int(s[8:10])
                return (y, mo, d)
            # DD-MM-YYYY
            parts = s.split('-')
            if len(parts) == 3 and len(parts[2]) == 4:
                return (int(parts[2]), int(parts[1]), int(parts[0]))
        except Exception:
            pass
        return None

    df['_date_tuple'] = df['Posting date'].apply(_to_date_tuple)
    df = df.dropna(subset=['_date_tuple'])
    df['_month'] = df['_date_tuple'].apply(lambda t: f"{t[0]:04d}-{t[1]:02d}")

    # For each month, get the funded amount of the latest date
    result: Dict[str, float] = {}
    for m, group in df.groupby('_month'):
        latest_row = group.loc[group['_date_tuple'].apply(lambda t: t if t else (0,0,0)).idxmax()]
        result[m] = round(float(latest_row['Funded amount']), 2)

    return result


# ─────────────────────────────────────────────────────────────
# Dividend Parser
# ─────────────────────────────────────────────────────────────

def parse_dividend_files(dividend_dir: str) -> Dict[str, Dict[str, float]]:
    """
    Parse all dividend statement CSV/Excel files in dividend_dir for all brokers.
    Returns: {
        'mstock': { 'YYYY-MM': float, ... },
        'mstock_ka': { 'YYYY-MM': float, ... },
        'zerodha': { 'YYYY-MM': float, ... },
        'dhan': { 'YYYY-MM': float, ... },
        ...
    }
    """
    result: Dict[str, Dict[str, float]] = {
        'mstock': {},
        'mstock_ka': {},
        'zerodha': {},
        'dhan': {}
    }

    if not os.path.exists(dividend_dir):
        return result

    for fname in os.listdir(dividend_dir):
        fpath = os.path.join(dividend_dir, fname)
        if os.path.isdir(fpath):
            continue

        fname_lower = fname.lower()
        if 'ma108170' in fname_lower:
            broker_key = 'mstock'
        elif 'ma135204' in fname_lower:
            broker_key = 'mstock_ka'
        elif 'rim544' in fname_lower or 'zerodha' in fname_lower:
            broker_key = 'zerodha'
        elif 'dhan' in fname_lower:
            broker_key = 'dhan'
        else:
            broker_key = 'other'

        if broker_key not in result:
            result[broker_key] = {}

        try:
            if fname_lower.endswith('.csv'):
                df = pd.read_csv(fpath)
                df.columns = [str(c).strip() for c in df.columns]
                
                date_col = next((c for c in df.columns if 'date' in c.lower()), None)
                amt_col = next((c for c in df.columns if 'total' in c.lower()), None)
                if not amt_col:
                    amt_col = next((c for c in df.columns if 'dividend' in c.lower() and 'per' not in c.lower()), None)
                
                if not date_col or not amt_col:
                    continue

                for _, row in df.iterrows():
                    d_val = str(row[date_col]).strip()
                    amt = pd.to_numeric(row[amt_col], errors='coerce')
                    if pd.isna(amt) or amt <= 0:
                        continue
                    
                    month_key = None
                    if len(d_val) >= 10:
                        if d_val[4] == '-' and d_val[7] == '-':
                            month_key = d_val[:7]
                        else:
                            parts = d_val.split('-')
                            if len(parts) == 3 and len(parts[2]) == 4:
                                month_key = f"{parts[2]}-{parts[1].zfill(2)}"
                    
                    if month_key:
                        result[broker_key][month_key] = round(result[broker_key].get(month_key, 0.0) + float(amt), 2)

            elif '.xlsx' in fname_lower:
                df = pd.read_excel(fpath, sheet_name=0)
                header_idx = None
                for idx, row in df.iterrows():
                    row_vals = [str(v) for v in row.values]
                    if any('ex-date' in v.lower() for v in row_vals):
                        header_idx = idx
                        break

                if header_idx is None:
                    continue

                df.columns = [str(c).strip() for c in df.iloc[header_idx]]
                df = df.iloc[header_idx + 1:].copy()

                date_col = next((c for c in df.columns if 'ex-date' in c.lower()), None)
                amt_col = next((c for c in df.columns if 'total' in c.lower() and 'earned' not in str(c).lower()), None)

                if not date_col or not amt_col:
                    continue

                for _, row in df.iterrows():
                    d_val = str(row[date_col]).strip()
                    amt = pd.to_numeric(row[amt_col], errors='coerce')
                    if pd.isna(amt) or amt <= 0:
                        continue

                    month_key = None
                    if len(d_val) >= 10:
                        if d_val[4] == '-' and d_val[7] == '-':
                            month_key = d_val[:7]
                        else:
                            parts = d_val.split('-')
                            if len(parts) == 3 and len(parts[2]) == 4:
                                month_key = f"{parts[2]}-{parts[1].zfill(2)}"

                    if month_key:
                        result[broker_key][month_key] = round(result[broker_key].get(month_key, 0.0) + float(amt), 2)

        except Exception:
            pass

    return result

