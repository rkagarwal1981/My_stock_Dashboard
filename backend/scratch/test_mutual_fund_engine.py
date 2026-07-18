import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, r"c:\My_Data\Shares Market\Antigravity\backend")

from services.mutual_fund_engine import MutualFundEngine
from services.database import SessionLocal
from models.holding import Holding

def run_tests():
    print("--- Starting Mutual Fund Engine Validation Tests ---")
    
    # Initialize Engine
    engine = MutualFundEngine()
    
    # Test Summary
    print("\n--- Test: get_summary() ---")
    summary = engine.get_summary()
    print("Source File:", summary["source_file"])
    print("Number of Funds:", summary["number_of_funds"])
    print("Available Funds:", summary["available_funds"])
    print("Number of Months:", summary["number_of_months"])
    print("Available Months:", summary["available_months"])
    print("Earliest Month:", summary["earliest_month"])
    print("Latest Month:", summary["latest_month"])
    print("Number of Unique Stocks:", summary["number_of_unique_stocks"])
    print("Duplicate Records:", summary["duplicate_records_found"])
    print("Data Quality Issues Count:", summary["data_quality_issues_count"])
    
    print("\nSample Data Quality Issues:")
    for issue in summary["data_quality_issues"][:5]:
        print(f"Row {issue['row']}: {issue['issue']} ({issue['severity']})")

    # Test Analytics
    print("\n--- Test: compute_analytics() ---")
    analytics = engine.compute_analytics("ALL")
    print("Total Unique Stock Analytics Records:", len(analytics))
    
    # Filter for active stocks in the latest month
    active_stocks = [a for a in analytics if a["status"] == "ACTIVE"]
    print("Active Stocks in Latest Month:", len(active_stocks))
    
    print("\nSample Stock Trends:")
    for a in active_stocks[:5]:
        print(f"Stock: {a['stock_name']} ({a['symbol']})")
        print(f"  Latest Qty: {a['latest_quantity']}, Value: {a['latest_value_crore']:.4f} Cr, LTP: {a['latest_ltp']}")
        print(f"  1M Change: {a['change_1m_crore']:.4f} Cr ({a['change_1m_pct']:.2f}%)")
        print(f"  Signal: {a['portfolio_signal']}, Held by Funds: {a['holding_funds']}")

    # Test Common Holdings
    print("\n--- Test: get_common_holdings() ---")
    common_2 = engine.get_common_holdings(2)
    common_3 = engine.get_common_holdings(3)
    common_4 = engine.get_common_holdings(4)
    print(f"Stocks held by 2+ funds: {len(common_2)}")
    print(f"Stocks held by 3+ funds: {len(common_3)}")
    print(f"Stocks held by all 4 funds: {len(common_4)}")
    
    print("\nSample Stocks held by all 4 funds:")
    for c in common_4[:5]:
        print(f"  {c['stock_name']} ({c['symbol']}) - Value: {c['latest_value_crore']:.4f} Cr")

    # Test Common Accumulation
    print("\n--- Test: get_common_accumulation() ---")
    accum = engine.get_common_accumulation()
    print(f"Stocks with common accumulation (2+ funds increasing): {len(accum)}")
    for a in accum[:5]:
        print(f"  {a['stock_name']} ({a['symbol']}) - Accumulating Funds: {a['accumulating_funds']} - Combined Increase: {a['combined_increase_crore']:.4f} Cr")

    # Test Stock Matching with Live Holdings
    print("\n--- Test: Stock Matching with Live Holdings ---")
    db = SessionLocal()
    try:
        live_holdings = db.query(Holding).all()
        # Convert model instances to dictionary for the engine
        live_holdings_dicts = []
        for h in live_holdings:
            live_holdings_dicts.append({
                "script": h.script,
                "broker": h.broker,
                "quantity": h.quantity,
                "avg_price": h.avg_price,
                "ltp": h.ltp
            })
            
        report = engine.get_unmatched_stocks_report(live_holdings_dicts)
        matched = [r for r in report if r["is_matched"]]
        unmatched = [r for r in report if not r["is_matched"]]
        print(f"Total Live Holdings positions evaluated: {len(report)}")
        print(f"Matched Positions: {len(matched)}")
        print(f"Unmatched Positions: {len(unmatched)}")
        
        print("\nSample Matched Live Holdings:")
        for m in matched[:5]:
            print(f"  Live: {m['live_scrip']} ({m['broker']}) -> MF Stock: {m['matched_stock_name']} (Fund Code: {m['matched_fund_code']}) [Type: {m['match_type']}]")
            
        print("\nSample Unmatched Live Holdings:")
        for u in unmatched[:5]:
            print(f"  Live: {u['live_scrip']} ({u['broker']}) - Qty: {u['quantity']}, Avg Price: {u['avg_price']}")
    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
