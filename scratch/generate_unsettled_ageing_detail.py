"""
Generate an Excel workbook that shows the transaction-level detail
behind every bar of the "Unsettled Transaction Ageing" chart.

Sheets produced:
  1. Raw Transactions         – every transaction loaded from DB (after exception filters)
  2. Excluded Transactions    – transactions that were EXCLUDED by exception filters
  3. Full LIFO Settlement     – all settlement rows produced by the LIFO engine
  4. All Unsettled BUYs       – only the unsettled-buy rows, with age and bucket columns
  5–13. One sheet per ageing bucket (0-7d, 8-15d, … >6mnth)
        showing the unsettled BUYs that fall into that bucket
  14. Bucket Summary          – counts & values per bucket (matches the bar chart)
"""

import os
import sys
from datetime import datetime
import pandas as pd

# ---------------------------------------------------------------------------
# Setup path so we can import backend services
# ---------------------------------------------------------------------------
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(base_dir, "backend")
sys.path.append(backend_dir)

from services.database import SessionLocal
from models.transaction import Transaction
from services.lifo_engine import compute_lifo_settlement

# ---------------------------------------------------------------------------
# Same bins used by the API endpoint /analytics/unsettled-ageing
# ---------------------------------------------------------------------------
BINS = [
    ("0-7d",    0,    7),
    ("8-15d",   8,   15),
    ("16-30d", 16,   30),
    ("1m",     31,   60),
    ("2m",     61,   90),
    ("3m",     91,  120),
    ("4m",    121,  150),
    ("5m",    151,  170),
    (">6mnth", 171, 999_999),
]

# ---------------------------------------------------------------------------
# Exception filters – these are the SAME filters applied by
# _apply_analytics_filters() in backend/api/routes.py (lines 1657-1670).
# Any transaction whose script matches one of these patterns is EXCLUDED
# from the Unsettled-Ageing chart.
# ---------------------------------------------------------------------------
EXCEPTION_PATTERNS = [
    "%PE-EQ",        # Put options
    "%CE-EQ",        # Call options
    "%ETF-EQ",       # ETFs
    "%FUT",          # Futures
    "%BEES-EQ",      # Gold/Silver BEES ETFs
    "SGB%",          # Sovereign Gold Bonds
    "%CALL",         # Call options (alternate naming)
    "%PUT",          # Put options (alternate naming)
    "SMALLCAP-EQ",   # Specific exclusion
    "ICICIB22-EQ",   # Specific exclusion
    "%-A-EQ",        # Auction stocks (e.g. INDRAMEDCO-A-EQ, JSWENERGY-A-EQ)
]

# Stocks that match an exception pattern but should NOT be excluded.
# e.g. BAJFINANCE-EQ ends with CE-EQ but is not a call option.
WHITELIST = [
    "BAJFINANCE-EQ",
    "RELIANCE-EQ",
]


def _safe_date(d) -> str:
    """Convert datetime to ISO date string, return '' for None."""
    if d is None:
        return ""
    try:
        return str(d.date()) if hasattr(d, "date") else str(d)
    except Exception:
        return str(d)


def _age_bin(age: int) -> str:
    """Return the bin label for a given age in days."""
    for label, lo, hi in BINS:
        if lo <= age <= hi:
            return label
    return ">6mnth"


def _matches_any_exception(script: str) -> str:
    """
    Check if a script name matches any exception pattern.
    Returns the matching pattern or empty string.
    Uses the same logic as SQLAlchemy's ilike() – case insensitive LIKE.
    Whitelisted stocks are never excluded even if they match a pattern.
    """
    script_lower = script.lower() if script else ""

    # Whitelisted stocks are never excluded
    if script_lower in [w.lower() for w in WHITELIST]:
        return ""

    for pat in EXCEPTION_PATTERNS:
        pat_lower = pat.lower()
        # Convert SQL LIKE pattern to simple check
        if pat_lower.startswith("%") and pat_lower.endswith("%"):
            if pat_lower[1:-1] in script_lower:
                return pat
        elif pat_lower.startswith("%"):
            if script_lower.endswith(pat_lower[1:]):
                return pat
        elif pat_lower.endswith("%"):
            if script_lower.startswith(pat_lower[:-1]):
                return pat
        else:
            if script_lower == pat_lower:
                return pat
    return ""


def main():
    print("=" * 70)
    print("  Unsettled Transaction Ageing – Detailed Validation Excel")
    print("=" * 70)

    db = SessionLocal()
    try:
        # ----------------------------------------------------------------
        # STEP 1 – Load ALL transactions from DB
        # ----------------------------------------------------------------
        print("\n[1/6] Fetching ALL transactions from database ...")
        all_txs = db.query(Transaction).order_by(
            Transaction.transaction_date.asc(), Transaction.id.asc()
        ).all()

        if not all_txs:
            print("  ❌  No transactions found. Aborting.")
            return

        print(f"  ✔  {len(all_txs)} total transactions loaded.")

        # ----------------------------------------------------------------
        # STEP 2 – Separate into INCLUDED vs EXCLUDED (exception filters)
        # ----------------------------------------------------------------
        print("\n[2/6] Applying exception filters ...")

        included_txs = []
        excluded_rows = []

        for t in all_txs:
            matched_pattern = _matches_any_exception(t.script)
            if matched_pattern:
                excluded_rows.append({
                    "ID":               t.id,
                    "Date":             _safe_date(t.transaction_date),
                    "Broker":           t.broker,
                    "Script":           t.script,
                    "Buy/Sell":         t.buy_sell,
                    "Quantity":         float(t.quantity),
                    "Price":            float(t.price),
                    "Net Amount":       float(t.net_amount),
                    "Excluded By Rule": matched_pattern,
                    "Reason":           _pattern_reason(matched_pattern),
                })
            else:
                included_txs.append(t)

        print(f"  ✔  {len(included_txs)} transactions INCLUDED for analysis.")
        print(f"  ✔  {len(excluded_rows)} transactions EXCLUDED (exceptions).")

        # ----------------------------------------------------------------
        # Build Raw Transactions sheet (included only)
        # ----------------------------------------------------------------
        raw_data = []
        for t in included_txs:
            raw_data.append({
                "ID":           t.id,
                "Date":         _safe_date(t.transaction_date),
                "Broker":       t.broker,
                "Script":       t.script,
                "Buy/Sell":     t.buy_sell,
                "Quantity":     float(t.quantity),
                "Price":        float(t.price),
                "Charges":      float(t.charges or 0.0),
                "Net Amount":   float(t.net_amount),
                "Exchange":     t.exchange or "",
                "Order Number": t.order_number or "",
            })
        df_raw = pd.DataFrame(raw_data)
        df_excluded = pd.DataFrame(excluded_rows)

        # ----------------------------------------------------------------
        # STEP 3 – Run LIFO Settlement on included transactions
        # ----------------------------------------------------------------
        print("\n[3/6] Running LIFO settlement engine ...")
        settlement = compute_lifo_settlement(included_txs)
        print(f"  ✔  {len(settlement)} settlement rows produced.")

        # Build full settlement sheet
        settlement_data = []
        for row in settlement:
            settlement_data.append({
                "Script":         str(row.get("scrip", "")),
                "Broker":         str(row.get("broker", "")),
                "Type":           str(row.get("type", "")),
                "Buy Date":       _safe_date(row.get("buy_date")),
                "Buy Price":      row.get("price"),
                "Quantity":       row.get("qty"),
                "Sell Date":      _safe_date(row.get("sell_date")),
                "Sell Price":     row.get("average_of_price"),
                "Sell Qty":       row.get("sum_of_qty"),
                "Comment":        row.get("comment", ""),
                "P&L":            row.get("pnl"),
                "Holding Days":   row.get("holding_days"),
                "Return %":       round(float(row["return_pct"]) * 100, 2) if row.get("return_pct") is not None else None,
            })
        df_settlement = pd.DataFrame(settlement_data)

        # ----------------------------------------------------------------
        # STEP 4 – Extract Unsettled BUYs and compute ageing
        # ----------------------------------------------------------------
        evaluation_date = datetime.now()
        print(f"\n[4/6] Extracting unsettled BUYs (evaluation date: {evaluation_date.date()}) ...")

        unsettled_data = []
        for row in settlement:
            if row.get("comment") == "Unsettled" and row.get("buy_date") is not None:
                bd = row["buy_date"]
                if isinstance(bd, str):
                    bd = datetime.fromisoformat(bd)
                age = (evaluation_date - bd).days
                if age < 0:
                    age = 0
                qty       = float(row["qty"]) if row["qty"] is not None else 0.0
                buy_price = float(row["price"]) if row["price"] is not None else 0.0
                buy_value = qty * buy_price

                unsettled_data.append({
                    "Script":               str(row["scrip"]),
                    "Broker":               str(row["broker"]),
                    "Buy Date":             _safe_date(bd),
                    "Quantity (Unsettled)":  qty,
                    "Buy Price":            buy_price,
                    "Buy Value":            round(buy_value, 2),
                    "Evaluation Date":      _safe_date(evaluation_date),
                    "Age (Days)":           int(age),
                    "Age Bucket":           _age_bin(age),
                })

        df_unsettled = pd.DataFrame(unsettled_data)
        print(f"  ✔  {len(unsettled_data)} unsettled BUY lots found.")

        # ----------------------------------------------------------------
        # STEP 5 – Split unsettled BUYs into per-bucket DataFrames
        # ----------------------------------------------------------------
        print("\n[5/6] Building per-bucket sheets ...")
        bucket_dfs = {}
        summary_data = []
        total_lots = len(unsettled_data)
        total_value = 0.0

        for label, lo, hi in BINS:
            if not df_unsettled.empty:
                mask = (df_unsettled["Age (Days)"] >= lo) & (df_unsettled["Age (Days)"] <= hi)
                bucket_df = df_unsettled[mask].copy()
            else:
                bucket_df = pd.DataFrame()

            count = len(bucket_df)
            value = round(bucket_df["Buy Value"].sum(), 2) if not bucket_df.empty else 0.0
            total_value += value
            pct = (count / total_lots * 100) if total_lots > 0 else 0.0

            bucket_dfs[label] = bucket_df
            summary_data.append({
                "Age Bucket":         label,
                "Min Days":           lo,
                "Max Days":           hi if hi < 999_999 else "∞",
                "Count (Lots)":       count,
                "Total Buy Value":    value,
                "Percentage (%)":     f"{pct:.1f}%",
            })
            print(f"    {label:>8s}:  {count:>4d} lots,  ₹{value:>12,.2f}")

        df_summary = pd.DataFrame(summary_data)

        # ----------------------------------------------------------------
        # STEP 6 – Write Excel
        # ----------------------------------------------------------------
        out_path = os.path.join(base_dir, "LIFO_Unsettled_Ageing_Detail.xlsx")
        print(f"\n[6/6] Writing Excel → {out_path} ...")

        with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
            # Sheet 1 – Raw Transactions (included)
            df_raw.to_excel(writer, sheet_name="1. Raw Transactions", index=False)

            # Sheet 2 – Excluded Transactions (exceptions)
            if not df_excluded.empty:
                df_excluded.to_excel(writer, sheet_name="2. Excluded (Exceptions)", index=False)
            else:
                pd.DataFrame([{"Note": "No transactions were excluded by exception filters."}]).to_excel(
                    writer, sheet_name="2. Excluded (Exceptions)", index=False
                )

            # Sheet 3 – Full LIFO Settlement
            df_settlement.to_excel(writer, sheet_name="3. Full LIFO Settlement", index=False)

            # Sheet 4 – All Unsettled BUYs
            if not df_unsettled.empty:
                df_unsettled.to_excel(writer, sheet_name="4. All Unsettled BUYs", index=False)

            # Sheets 5-13 – Per-bucket detail
            for idx, (label, lo, hi) in enumerate(BINS, start=5):
                sheet_name = f"{idx}. Bucket {label}"
                bdf = bucket_dfs[label]
                if not bdf.empty:
                    bdf.to_excel(writer, sheet_name=sheet_name, index=False)
                else:
                    pd.DataFrame([{"Note": f"No unsettled BUYs in bucket '{label}' ({lo}-{hi} days)."}]).to_excel(
                        writer, sheet_name=sheet_name, index=False
                    )

            # Final sheet – Summary
            df_summary.to_excel(writer, sheet_name="14. Bucket Summary", index=False)

        print(f"\n{'=' * 70}")
        print(f"  ✅  Excel created successfully!")
        print(f"  📂  {out_path}")
        print(f"  📊  Total unsettled lots : {total_lots}")
        print(f"  💰  Total buy value      : ₹{total_value:,.2f}")
        print(f"{'=' * 70}")

    except Exception as exc:
        import traceback
        print(f"\n❌ ERROR: {type(exc).__name__}: {exc}")
        traceback.print_exc()
    finally:
        db.close()


def _pattern_reason(pattern: str) -> str:
    """Human-readable reason for each exclusion pattern."""
    reasons = {
        "%PE-EQ":       "Put Option (Equity)",
        "%CE-EQ":       "Call Option (Equity)",
        "%ETF-EQ":      "Exchange Traded Fund",
        "%FUT":         "Futures contract",
        "%BEES-EQ":     "Gold/Silver BEES ETF",
        "SGB%":         "Sovereign Gold Bond",
        "%CALL":        "Call Option",
        "%PUT":         "Put Option",
        "SMALLCAP-EQ":  "Specific exclusion (SMALLCAP)",
        "ICICIB22-EQ":  "Specific exclusion (ICICIB22)",
        "%-A-EQ":       "Auction stock (e.g. INDRAMEDCO-A-EQ)",
    }
    return reasons.get(pattern, "Unknown")


if __name__ == "__main__":
    main()
