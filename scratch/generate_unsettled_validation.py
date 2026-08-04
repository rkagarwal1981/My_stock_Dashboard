import os
import sys
from datetime import datetime
import pandas as pd

# Add the backend directory to sys.path so we can import services and models
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(base_dir, "backend")
sys.path.append(backend_dir)

from services.database import SessionLocal
from models.transaction import Transaction
from services.lifo_engine import compute_lifo_settlement

BINS = [
    ("0-7d",    0,    7),
    ("8-15d",   8,   15),
    ("16-30d", 16,   30),
    ("1m",     31,   60),
    ("2m",     61,   90),
    ("3m",     91,  120),
    ("4m",    121,  150),
    ("5m",    151,  170),
    (">6mnth", 171, 999999),
]

def _age_bin(age: int) -> str:
    for label, lo, hi in BINS:
        if lo <= age <= hi:
            return label
    return ">4mnth"

def _safe_date(d) -> str:
    """Convert datetime to ISO date string, return '' for None."""
    if d is None:
        return ""
    try:
        return str(d.date()) if hasattr(d, "date") else str(d)
    except Exception:
        return str(d)

def main():
    print("Connecting to database...")
    db = SessionLocal()
    try:
        # 1. Fetch all transactions from database (ignoring SGB, FUT, PE, CE, ETF)
        print("Fetching transactions...")
        from sqlalchemy import not_
        txs = db.query(Transaction).filter(
            not_(Transaction.script.ilike('%PE-EQ')),
            not_(Transaction.script.ilike('%CE-EQ')),
            not_(Transaction.script.ilike('%ETF-EQ')),
            not_(Transaction.script.ilike('%FUT')),
            not_(Transaction.script.ilike('%BEES-EQ')),
            not_(Transaction.script.ilike('SGB%')),
            not_(Transaction.script.ilike('%CALL')),
            not_(Transaction.script.ilike('%PUT')),
            not_(Transaction.script.ilike('SMALCAP-EQ')),
            not_(Transaction.script.ilike('ICICIB22-EQ'))
        ).order_by(
            Transaction.transaction_date.asc(), Transaction.id.asc()
        ).all()
        if not txs:
            print("No transactions found in database.")
            return

        print(f"Loaded {len(txs)} transactions.")

        # --- Sheet 1: Raw Transactions ---
        tx_data = []
        for t in txs:
            tx_data.append({
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
        df_txs = pd.DataFrame(tx_data)

        # --- Run LIFO ---
        print("Running LIFO settlement engine...")
        settlement = compute_lifo_settlement(txs)
        print(f"Settlement rows produced: {len(settlement)}")

        evaluation_date = datetime.now()

        # --- Sheet 2: LIFO Matched Pairs ---
        matches_data = []
        # --- Sheet 3: Unsettled BUYs ---
        unsettled_data = []

        for row in settlement:
            comment = row.get("comment", "")

            if comment == "Unsettled":
                bd = row.get("buy_date")
                if bd is None:
                    # Unsettled SELL — skip per spec
                    continue
                age = (evaluation_date - bd).days
                if age < 0:
                    age = 0
                unsettled_data.append({
                    "Script":              str(row["scrip"]),
                    "Broker":              str(row["broker"]),
                    "Buy Date":            _safe_date(bd),
                    "Quantity (Unsettled)": float(row["qty"]) if row["qty"] is not None else 0.0,
                    "Buy Price":           float(row["price"]) if row["price"] is not None else 0.0,
                    "Evaluation Date":     _safe_date(evaluation_date),
                    "Age (Days)":          int(age),
                    "Age Bin":             _age_bin(age),
                })
            elif comment in ("Fully Settled", "Partially Settled"):
                pct = (
                    round(float(row["return_pct"]) * 100, 2)
                    if row.get("return_pct") is not None else 0.0
                )
                matches_data.append({
                    "Script":         str(row["scrip"]),
                    "Broker":         str(row["broker"]),
                    "Buy Date":       _safe_date(row.get("buy_date")),
                    "Buy Qty":        float(row["qty"]) if row["qty"] is not None else 0.0,
                    "Buy Price":      float(row["price"]) if row["price"] is not None else 0.0,
                    "Sell Date":      _safe_date(row.get("sell_date")),
                    "Sell Qty":       float(row["sum_of_qty"]) if row.get("sum_of_qty") is not None else 0.0,
                    "Sell Price":     float(row["average_of_price"]) if row.get("average_of_price") is not None else 0.0,
                    "Holding Days":   int(row["holding_days"]) if row.get("holding_days") is not None else 0,
                    "P&L":            float(row["pnl"]) if row["pnl"] is not None else 0.0,
                    "Return %":       pct,
                    "Comment":        comment,
                })

        df_matches   = pd.DataFrame(matches_data)
        df_unsettled = pd.DataFrame(unsettled_data)

        print(f"Matched pairs: {len(matches_data)}")
        print(f"Unsettled BUY lots: {len(unsettled_data)}")

        # --- Sheet 4: Summary Bins ---
        total_open_lots = len(unsettled_data)
        summary_data = []
        for bin_label, lo, hi in BINS:
            if not df_unsettled.empty:
                count = df_unsettled[
                    (df_unsettled["Age (Days)"] >= lo) &
                    (df_unsettled["Age (Days)"] <= hi)
                ].shape[0]
            else:
                count = 0
            pct = (count / total_open_lots * 100) if total_open_lots > 0 else 0.0
            summary_data.append({
                "Age Bin":           bin_label,
                "Min Days":          lo,
                "Max Days":          hi if hi < 999999 else "Infinity",
                "Count (Open Lots)": count,
                "Percentage (%)":    f"{pct:.1f}%",
            })
        df_summary = pd.DataFrame(summary_data)

        print("\n=== Summary Bins ===")
        print(df_summary.to_string(index=False))

        # --- Write Excel ---
        out_path = os.path.join(base_dir, "LIFO_Unsettled_Ageing_Validation.xlsx")
        print(f"\nWriting Excel to: {out_path} ...")

        with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
            df_txs.to_excel(writer,      sheet_name="1. Raw Transactions",    index=False)
            if not df_matches.empty:
                df_matches.to_excel(writer,  sheet_name="2. LIFO Matched Pairs", index=False)
            if not df_unsettled.empty:
                df_unsettled.to_excel(writer, sheet_name="3. LIFO Unsettled BUYs", index=False)
            df_summary.to_excel(writer,  sheet_name="4. Unsettled Bins Summary", index=False)

        print("Excel file created successfully!")

    except Exception as exc:
        import traceback
        print("ERROR:", type(exc).__name__, str(exc))
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    main()
