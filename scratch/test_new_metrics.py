import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, r"c:\My_Data\Shares Market\Antigravity\backend")

from services.mutual_fund_engine import MutualFundEngine
from services.database import SessionLocal
from models.holding import Holding

def verify_new_metrics():
    print("--- Verifying New Metrics on get_matching_funds_for_holdings ---")
    engine = MutualFundEngine()
    
    db = SessionLocal()
    try:
        live_holdings = db.query(Holding).all()
        live_holdings_dicts = []
        for h in live_holdings:
            live_holdings_dicts.append({
                "script": h.script,
                "broker": h.broker,
                "quantity": h.quantity,
                "avg_price": h.avg_price,
                "ltp": h.ltp
            })
        
        matches = engine.get_matching_funds_for_holdings(live_holdings_dicts)
        print("Total matched scripts:", len(matches))
        
        # Look for BHARTIARTL or any script with matches
        target_script = None
        for script, fund_list in matches.items():
            if len(fund_list) > 0:
                target_script = script
                if "BHARTIARTL" in script:
                    break
        
        if target_script:
            print(f"\nFound matches for script: {target_script}")
            for fund in matches[target_script]:
                print(f"Fund Code: {fund['fund_code']}")
                print(f"  Fund Name: {fund['fund_name']}")
                print(f"  Latest Value: {fund['latest_value']:.4f} Cr")
                print(f"  1M Change: {fund['change_1m']:.4f} Cr ({fund['change_1m_pct']:.2f}%)")
                print(f"  2M Change: {fund['change_2m']:.4f} Cr ({fund['change_2m_pct']:.2f}%)")
                print(f"  3M Change: {fund['change_3m']:.4f} Cr ({fund['change_3m_pct']:.2f}%)")
                print(f"  3M Trend: {fund['trend_3m']}")
                print(f"  Portfolio Signal: {fund['portfolio_signal']}")
                
                # Assert keys are present
                assert "change_2m" in fund
                assert "change_2m_pct" in fund
                assert "change_3m" in fund
                assert "change_3m_pct" in fund
                assert "portfolio_signal" in fund
            print("\nVerification successful! All keys are present and calculated.")
        else:
            print("No scripts with mutual fund holdings found.")
            
    finally:
        db.close()

if __name__ == "__main__":
    verify_new_metrics()
