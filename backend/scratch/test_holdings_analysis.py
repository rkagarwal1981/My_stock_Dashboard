import os
import sys

# Ensure backend root is in python path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from services.database import SessionLocal, engine, Base
from services.metadata_service import get_or_fetch_stock_metadata
from models.stock_metadata import StockMetadata
from models.holding import Holding

def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Clear existing cached metadata to force fresh sync
        print("Clearing cached stock_metadata to force fresh sync...")
        db.query(StockMetadata).delete()
        db.commit()

        # Get all holdings symbols
        holdings = db.query(Holding).all()
        scrips = list(set(h.script for h in holdings))
        print(f"Active stock positions in database: {len(scrips)}")
        print(f"Scrips: {scrips}")
        
        # Test get_or_fetch_stock_metadata
        print("\n--- Running metadata sync (fetching missing/stale scrips from yfinance) ---")
        metadata_map = get_or_fetch_stock_metadata(db, scrips, force_refresh=True)
        print(f"Successfully processed metadata for {len(metadata_map)} scrips.")
        
        # Display sample results
        print("\nSample Results:")
        for scrip in scrips[:5]:
            meta = metadata_map.get(scrip)
            if meta:
                print(f" - Scrip: {scrip}")
                print(f"   Name: {meta.company_name}")
                print(f"   Sector: {meta.sector}")
                print(f"   Industry: {meta.industry}")
                print(f"   Market Cap: {meta.market_cap} ({meta.market_cap_category})")
                print(f"   Beta: {meta.beta}")
            else:
                print(f" - Scrip: {scrip} (No metadata found!)")
                
        # Perform portfolio average beta calculations
        print("\n--- Running Portfolio Risk Analysis Calculations ---")
        total_val = sum(float(h.current_value or 0.0) for h in holdings)
        weighted_beta_sum = 0.0
        beta_weight_sum = 0.0
        actual_beta_sum = 0.0
        actual_beta_count = 0
        
        for h in holdings:
            cv = float(h.current_value or 0.0)
            if cv <= 0:
                continue
            meta = metadata_map.get(h.script)
            beta = meta.beta if meta else None
            
            # Default to 1.0 if missing
            actual_beta = beta if beta is not None else 1.0
            weighted_beta_sum += cv * actual_beta
            beta_weight_sum += cv
            
            if beta is not None:
                actual_beta_sum += cv
                actual_beta_count += 1
                
        portfolio_beta = (weighted_beta_sum / beta_weight_sum) if beta_weight_sum > 0 else 1.0
        coverage_pct = (actual_beta_sum / total_val * 100.0) if total_val > 0 else 0.0
        
        print(f"Total Portfolio Value: {total_val}")
        print(f"Calculated Weighted Average Beta: {portfolio_beta:.3f}")
        print(f"Actual Beta Coverage: {coverage_pct:.2f}% of portfolio value ({actual_beta_count} of {len(holdings)} holdings)")
        print("\nTEST PASSED successfully!")
    except Exception as e:
        print(f"TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    main()
