import os
import sys
import logging
import pandas as pd
from typing import Dict, List, Any, Optional

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MutualFundEngine")

# Reusable fund name mappings and code mappings
FUND_NAME_TO_CODE = {
    "HDFC Flexi Cap": "H",
    "PPFCF": "P",
    "Quant Flexi Cap": "Q",
    "JM Financial": "J",
    "HDFC Value Funds": "HV",
    "HSBC Value Fund": "HS",
    "ICICI Value Fund": "IC"
}

FUND_CODE_TO_FULL_NAME = {
    "H": "HDFC Flexi Cap Fund",
    "P": "Parag Parikh Flexi Cap Fund",
    "Q": "Quant Flexi Cap Fund",
    "J": "JM Flexicap Fund",
    "HV": "HDFC Value Fund",
    "HS": "HSBC Value Fund",
    "IC": "ICICI Value Fund"
}

# Configurable stock name manual mapping
MANUAL_STOCK_MAP = {
    # e.g., "MF Stock Name": "Holdings Script Symbol" (without -EQ or with -EQ)
}

# Configurable tolerance for 5-month "Stable" trend classification
# A stock holding is stable if maximum variation in Crore is <= 2% of average, or <= 0.05 Crore absolute
STABLE_RELATIVE_TOLERANCE = 0.02
STABLE_ABSOLUTE_TOLERANCE = 0.05

class MutualFundEngine:
    def __init__(self, dir_or_file_path: Optional[str] = None):
        workspace_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        if dir_or_file_path is None or not os.path.exists(dir_or_file_path):
            mf_dir = os.path.join(workspace_root, "Manual Data", "Mutual Funds")
            if os.path.exists(mf_dir):
                self.mf_dir = mf_dir
                self.file_path = None
            else:
                fallback = os.path.join(workspace_root, "Mutual Funds data.xlsx")
                self.mf_dir = None
                self.file_path = fallback if os.path.exists(fallback) else dir_or_file_path
        elif os.path.isdir(dir_or_file_path):
            self.mf_dir = dir_or_file_path
            self.file_path = None
        else:
            self.file_path = dir_or_file_path
            self.mf_dir = None

        self.last_modified_time: float = 0.0
        self._cached_df: Optional[pd.DataFrame] = None
        self._cached_summary: Optional[Dict[str, Any]] = None
        self._validation_issues: List[Dict[str, Any]] = []
        self._cached_match_index: Optional[Dict[str, Any]] = None

    def _normalize_name(self, name: str) -> str:
        """
        Normalizes company names for deterministic comparison.
        """
        if pd.isna(name) or name is None:
            return ""
        # Convert to uppercase
        name = str(name).upper().strip()
        # Remove duplicate spaces
        name = " ".join(name.split())
        # Normalize '&' and 'AND'
        name = name.replace("&", " AND ")
        # Remove duplicate spaces again
        name = " ".join(name.split())
        # Remove unnecessary punctuation (keep spaces and alphanumeric)
        name = "".join(c for c in name if c.isalnum() or c.isspace())
        name = " ".join(name.split())
        
        # Remove common suffixes
        suffixes = ["LIMITED", "LTD", "LTD."]
        words = name.split()
        cleaned_words = [w for w in words if w not in suffixes]
        return " ".join(cleaned_words)

    def _normalize_month_str(self, month_val: Any) -> str:
        """
        Normalizes any month string (e.g. 'Aug-2026', 'Aug 2026') to 'Aug 2026'.
        """
        if pd.isna(month_val) or month_val is None:
            return ""
        s = str(month_val).strip()
        from datetime import datetime
        for fmt in ("%b %Y", "%b-%Y", "%B %Y", "%B-%Y", "%Y-%m-%d"):
            try:
                dt = datetime.strptime(s, fmt)
                return dt.strftime("%b %Y")
            except ValueError:
                pass
        try:
            ts = pd.Timestamp(s)
            return ts.strftime("%b %Y")
        except Exception:
            return s

    def _parse_month(self, month_str: str) -> Optional[str]:
        """
        Parses Month string like 'Mar 2026' or 'Mar-2026' into a standard date string 'YYYY-MM-DD'.
        """
        if pd.isna(month_str) or not str(month_str).strip():
            return None
        norm = self._normalize_month_str(month_str)
        try:
            from datetime import datetime
            dt = datetime.strptime(norm, "%b %Y")
            return dt.strftime("%Y-%m-%d")
        except Exception:
            try:
                ts = pd.Timestamp(norm)
                return ts.strftime("%Y-%m-%d")
            except Exception:
                return None

    def _load_and_process(self) -> None:
        """
        Loads the excel/csv files from folder or single path, validates the schema/data quality,
        computes normalized values, assigns MF Category, and updates cache.
        """
        files_to_load = []
        if self.mf_dir and os.path.exists(self.mf_dir):
            for fname in os.listdir(self.mf_dir):
                if fname.startswith("~$") or fname.startswith("."):
                    continue
                if fname.lower().endswith((".xlsx", ".xls", ".csv")):
                    files_to_load.append(os.path.join(self.mf_dir, fname))
        elif self.file_path and os.path.exists(self.file_path):
            files_to_load.append(self.file_path)

        if not files_to_load:
            raise FileNotFoundError(f"Mutual Funds data files not found in: {self.mf_dir or self.file_path}")

        current_mtime = max(os.path.getmtime(f) for f in files_to_load)
        if self._cached_df is not None and current_mtime <= self.last_modified_time:
            return  # Cache is up to date

        logger.info(f"Reloading Mutual Funds data from {len(files_to_load)} files (mtime changed)...")
        dfs = []
        self._validation_issues = []

        required_cols = ["Mutual Fund", "Month", "ISIN", "Stock Name", "Quantity", "LTP"]

        for fpath in sorted(files_to_load):
            fname = os.path.basename(fpath).lower()
            category = "Flexicap"
            if "value" in fname:
                category = "Value"
            elif "flexi" in fname:
                category = "Flexicap"

            if fpath.lower().endswith(".csv"):
                df_single = pd.read_csv(fpath)
            else:
                df_single = pd.read_excel(fpath)

            df_single.columns = [str(c).strip() for c in df_single.columns]
            df_single["MF Category"] = category

            # Validate Schema Columns
            for col in required_cols:
                if col not in df_single.columns:
                    issue = {"file": os.path.basename(fpath), "issue": f"Missing required column: {col}", "severity": "ERROR"}
                    self._validation_issues.append(issue)
                    logger.error(f"{os.path.basename(fpath)}: {issue['issue']}")

            # Normalize Month
            if "Month" in df_single.columns:
                df_single["Month"] = df_single["Month"].apply(self._normalize_month_str)

            dfs.append(df_single)

        df = pd.concat(dfs, ignore_index=True)

        # Check unexpected fund names & data quality
        for idx, row in df.iterrows():
            fund = row.get("Mutual Fund")
            if pd.isna(fund) or fund not in FUND_NAME_TO_CODE:
                self._validation_issues.append({
                    "row": idx + 2,
                    "issue": f"Unexpected or blank fund name: {fund}",
                    "severity": "WARNING"
                })

            month = row.get("Month")
            if pd.isna(month) or self._parse_month(str(month)) is None:
                self._validation_issues.append({
                    "row": idx + 2,
                    "issue": f"Unexpected or blank month format: {month}",
                    "severity": "WARNING"
                })

            stock_name = row.get("Stock Name")
            if pd.isna(stock_name) or str(stock_name).strip() == "":
                self._validation_issues.append({
                    "row": idx + 2,
                    "issue": "Missing stock name",
                    "severity": "ERROR"
                })

            qty = row.get("Quantity")
            if pd.isna(qty) or not isinstance(qty, (int, float)) or qty <= 0:
                self._validation_issues.append({
                    "row": idx + 2,
                    "issue": f"Invalid quantity: {qty}",
                    "severity": "ERROR"
                })

            ltp = row.get("LTP")
            if pd.isna(ltp) or not isinstance(ltp, (int, float)) or ltp < 0:
                self._validation_issues.append({
                    "row": idx + 2,
                    "issue": f"Invalid LTP: {ltp}",
                    "severity": "ERROR"
                })
            elif ltp == 0:
                self._validation_issues.append({
                    "row": idx + 2,
                    "issue": f"LTP is 0 for {row.get('Stock Name')}",
                    "severity": "WARNING"
                })

        # Process and normalize fields
        df["Fund Code"] = df["Mutual Fund"].map(FUND_NAME_TO_CODE).fillna("UNKNOWN")
        df["Parsed Month"] = df["Month"].apply(lambda m: self._parse_month(str(m)))
        df["Normalized Stock Name"] = df["Stock Name"].apply(self._normalize_name)
        df["Holding Value"] = df["Quantity"] * df["LTP"]
        df["Holding Value Crore"] = df["Holding Value"] / 10000000.0

        # Check duplicate Mutual Fund + Month + ISIN
        dup_mask = df.duplicated(subset=["Mutual Fund", "Month", "ISIN"], keep=False)
        dups = df[dup_mask]
        if not dups.empty:
            for idx, row in dups.iterrows():
                self._validation_issues.append({
                    "row": idx + 2,
                    "issue": f"Duplicate record for {row.get('Mutual Fund')} - {row.get('Month')} - {row.get('ISIN')}",
                    "severity": "WARNING"
                })

        self._cached_df = df
        self.last_modified_time = current_mtime
        self._cached_summary = None  # Reset summary cache
        self._cached_match_index = None  # Reset match index cache
        logger.info(f"Mutual Funds data ({len(df)} rows across {len(files_to_load)} files) processed successfully.")

    def get_raw_dataframe(self) -> pd.DataFrame:
        self._load_and_process()
        return self._cached_df

    def get_validation_issues(self) -> List[Dict[str, Any]]:
        self._load_and_process()
        return self._validation_issues

    def get_summary(self) -> Dict[str, Any]:
        """
        Returns Phase 1 Summary metrics.
        """
        self._load_and_process()
        if self._cached_summary is not None:
            return self._cached_summary

        df = self._cached_df
        available_funds = df["Mutual Fund"].dropna().unique().tolist()
        available_months = sorted(df["Month"].dropna().unique().tolist(), key=lambda m: self._parse_month(m) or "1970-01-01")
        categories = df["MF Category"].dropna().unique().tolist()

        earliest_month = available_months[0] if available_months else "N/A"
        latest_month = available_months[-1] if available_months else "N/A"

        unique_stocks_names = df["Stock Name"].dropna().unique().tolist()

        # Check duplicates on [Mutual Fund, Month, ISIN]
        duplicates_count = df.duplicated(subset=["Mutual Fund", "Month", "ISIN"]).sum()

        self._cached_summary = {
            "source_file": os.path.basename(self.mf_dir) if self.mf_dir else (os.path.basename(self.file_path) if self.file_path else "Mutual Funds"),
            "number_of_funds": len(available_funds),
            "available_funds": [
                {
                    "name": f,
                    "code": FUND_NAME_TO_CODE.get(f, "U"),
                    "category": df[df["Mutual Fund"] == f]["MF Category"].iloc[0] if not df[df["Mutual Fund"] == f].empty else "Flexicap"
                }
                for f in available_funds
            ],
            "categories": categories,
            "number_of_months": len(available_months),
            "available_months": available_months,
            "earliest_month": earliest_month,
            "latest_month": latest_month,
            "number_of_unique_stocks": len(unique_stocks_names),
            "data_quality_issues_count": len(self._validation_issues),
            "data_quality_issues": self._validation_issues,
            "duplicate_records_found": int(duplicates_count)
        }
        return self._cached_summary

    def get_available_months(self) -> List[str]:
        """
        Returns chronological list of months like ['Jan 2026', 'Feb 2026', ...]
        """
        summary = self.get_summary()
        return summary["available_months"]

    def get_latest_month(self) -> str:
        summary = self.get_summary()
        return summary["latest_month"]

    def get_previous_month(self, month_str: str) -> Optional[str]:
        months = self.get_available_months()
        if month_str in months:
            idx = months.index(month_str)
            if idx > 0:
                return months[idx - 1]
        return None

    def match_stock(self, mf_row: Dict[str, Any], live_holdings: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Matches a mutual fund stock record to a live holding record based on:
        1. ISIN match (if available)
        2. Stock symbol match (comparing Stock Name.1/ticker with live holding scrip ticker)
        3. Normalized stock name match
        4. Configurable manual mapping
        """
        mf_isin = mf_row.get("ISIN")
        mf_symbol = mf_row.get("Stock Name.1")
        mf_name = mf_row.get("Stock Name", "")
        norm_mf_name = self._normalize_name(mf_name)
        norm_mf_symbol = str(mf_symbol).strip().upper() if pd.notna(mf_symbol) else ""

        # Step 4: Explicit manual mapping check first
        if mf_name in MANUAL_STOCK_MAP:
            mapped_scrip = MANUAL_STOCK_MAP[mf_name]
            for lh in live_holdings:
                if lh.get("script") == mapped_scrip:
                    return lh

        for lh in live_holdings:
            scrip = lh.get("script", "")
            # Clean live holding symbol (e.g. "BHARTIARTL-EQ" -> "BHARTIARTL")
            clean_scrip = scrip[:-3] if scrip.endswith("-EQ") else scrip
            clean_scrip = clean_scrip.strip().upper()

            # Step 1: ISIN match (if live holdings contains ISIN column)
            lh_isin = lh.get("isin")
            if lh_isin and mf_isin and lh_isin.strip().upper() == mf_isin.strip().upper():
                return lh

            # Step 2: Stock symbol match
            if norm_mf_symbol and clean_scrip == norm_mf_symbol:
                return lh

            # Step 3: Normalized Stock Name match
            # Compare normalized scrip symbol or if we have stock name in live holdings
            lh_name = lh.get("stock_name", "")
            if lh_name:
                norm_lh_name = self._normalize_name(lh_name)
                if norm_mf_name == norm_lh_name:
                    return lh
            
            # Fallback: if scrip matches normalized name exactly
            if norm_mf_name == self._normalize_name(clean_scrip):
                return lh

        return None

    def compute_analytics(self, selected_fund_code: Optional[str] = None, category: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Calculates chronological month-by-month holdings, value, changes,
        trends (MoM changes, NEW, EXITED, continuous increases/decreases, and 5-month trends),
        and overall stock appearance count across all mutual fund schemes.
        """
        self._load_and_process()
        full_df = self._cached_df
        if full_df is None or full_df.empty:
            return []

        # Precompute stock total appearance count across all schemes in the full dataset
        full_stock_groups = full_df.groupby(["Fund Code", "Mutual Fund", "ISIN", "Stock Name"]).groups.keys()
        stock_total_counts = {}
        for (fc, fm, isin_v, sname_v) in full_stock_groups:
            isin_k = str(isin_v or "").strip().upper()
            norm_k = self._normalize_name(sname_v or "")
            k = isin_k if isin_k else norm_k
            stock_total_counts[k] = stock_total_counts.get(k, 0) + 1

        df = full_df
        if selected_fund_code and selected_fund_code != "ALL":
            df = df[df["Fund Code"] == selected_fund_code]

        if category and category != "ALL":
            df = df[df["MF Category"] == category]

        # Chronological months
        months = self.get_available_months()
        if not months:
            return []

        # We group by (Fund Code, Mutual Fund, MF Category, ISIN, Stock Name, Symbol, Industry)
        # so each mutual fund scheme holding a stock is computed as an independent row model
        stock_groups = df.groupby(["Fund Code", "Mutual Fund", "MF Category", "ISIN", "Stock Name", "Stock Name.1", "Industry"]).groups
        
        analytics_list = []

        latest_m_global = months[-1]

        for (f_code, f_name, f_cat, isin, name, symbol, industry) in stock_groups.keys():
            # Get data for this fund scheme and stock
            stock_df = df[(df["Fund Code"] == f_code) & (df["ISIN"] == isin) & (df["Stock Name"] == name)]
            
            # Create a dict of month -> row details for this specific scheme
            month_data = {}
            for _, r in stock_df.iterrows():
                month_data[r["Month"]] = {
                    "quantity": r["Quantity"],
                    "value_crore": r["Holding Value Crore"],
                    "ltp": r["LTP"],
                    "pct_nav": r["% to NAV"]
                }

            # Month-by-month values
            month_values = []
            for m in months:
                month_values.append(month_data.get(m, {"quantity": 0.0, "value_crore": 0.0, "ltp": 0.0, "pct_nav": 0.0}))

            # Now calculate trends for this scheme
            latest_idx = len(months) - 1
            latest_val = month_values[latest_idx]["value_crore"]
            prev_val = month_values[latest_idx - 1]["value_crore"] if latest_idx > 0 else 0.0

            # MoM Change
            change_1m = latest_val - prev_val
            pct_change_1m = 0.0
            if prev_val > 0.0:
                pct_change_1m = (change_1m / prev_val) * 100.0
            
            # Status: NEW, EXITED, ACTIVE
            status = "ACTIVE"
            if latest_val > 0.0 and prev_val == 0.0:
                status = "NEW"
            elif latest_val == 0.0 and prev_val > 0.0:
                status = "EXITED"
            elif latest_val == 0.0 and prev_val == 0.0:
                status = "INACTIVE"  # Not held in either latest or previous

            # Calculate 2-month change
            change_2m = 0.0
            pct_change_2m = 0.0
            if latest_idx >= 2:
                prev_2m = month_values[latest_idx - 2]["value_crore"]
                change_2m = latest_val - prev_2m
                if prev_2m > 0.0:
                    pct_change_2m = (change_2m / prev_2m) * 100.0

            # Calculate 3-month change
            change_3m = 0.0
            pct_change_3m = 0.0
            if latest_idx >= 3:
                prev_3m = month_values[latest_idx - 3]["value_crore"]
                change_3m = latest_val - prev_3m
                if prev_3m > 0.0:
                    pct_change_3m = (change_3m / prev_3m) * 100.0

            # Trend Classification
            inc_2m = False
            dec_2m = False
            if latest_idx >= 2:
                v0 = month_values[latest_idx]["value_crore"]
                v1 = month_values[latest_idx - 1]["value_crore"]
                v2 = month_values[latest_idx - 2]["value_crore"]
                if v0 > v1 and v1 > v2:
                    inc_2m = True
                elif v0 < v1 and v1 < v2:
                    dec_2m = True

            # Increased continuously for last 3 months
            inc_3m = False
            dec_3m = False
            if latest_idx >= 3:
                v0 = month_values[latest_idx]["value_crore"]
                v1 = month_values[latest_idx - 1]["value_crore"]
                v2 = month_values[latest_idx - 2]["value_crore"]
                v3 = month_values[latest_idx - 3]["value_crore"]
                if v0 > v1 and v1 > v2 and v2 > v3:
                    inc_3m = True
                elif v0 < v1 and v1 < v2 and v2 < v3:
                    dec_3m = True

            # Consistently held for last 5 months
            consistent_5m = False
            trend_5m = "N/A"
            if latest_idx >= 4:
                window = month_values[latest_idx-4 : latest_idx+1]
                vals = [w["value_crore"] for w in window]
                if all(v > 0.0 for v in vals):
                    consistent_5m = True
                    avg_val = sum(vals) / 5.0
                    max_val = max(vals)
                    min_val = min(vals)
                    
                    rel_tol = avg_val * STABLE_RELATIVE_TOLERANCE
                    tol = max(rel_tol, STABLE_ABSOLUTE_TOLERANCE)
                    
                    if (max_val - min_val) <= tol:
                        trend_5m = "Stable"
                    else:
                        increases = 0
                        decreases = 0
                        for i in range(1, 5):
                            if vals[i] > vals[i-1]:
                                increases += 1
                            elif vals[i] < vals[i-1]:
                                decreases += 1
                        
                        if vals[-1] > vals[0] and increases > decreases:
                            trend_5m = "Gradually Increasing"
                        elif vals[-1] < vals[0] and decreases > increases:
                            trend_5m = "Gradually Decreasing"
                        else:
                            trend_5m = "Mixed"

            # Portfolio Signal (derived analytical label for this scheme)
            signal = "Stable Holding" if (consistent_5m and trend_5m == "Stable") else "Active"
            
            if status == "NEW":
                signal = "New Entry"
            elif status == "EXITED":
                signal = "Exited"
            elif inc_3m:
                signal = "Strong Accumulation"
            elif change_1m > 0:
                signal = "Accumulating"
            elif dec_3m:
                signal = "Strong Reduction"
            elif change_1m < 0:
                signal = "Reducing"

            # Check fund changes in latest month
            accumulating_funds = []
            reducing_funds = []
            is_divergent = False
            divergent_details = {}
            if latest_idx > 0 and status == "ACTIVE":
                latest_m = months[latest_idx]
                prev_m = months[latest_idx - 1]
                
                fund_changes = {}
                for fc_name, fc_code in FUND_NAME_TO_CODE.items():
                    f_stock_all = self._cached_df[(self._cached_df["Fund Code"] == fc_code) & (self._cached_df["ISIN"] == isin)]
                    val_latest = f_stock_all[f_stock_all["Month"] == latest_m]["Holding Value Crore"].sum()
                    val_prev = f_stock_all[f_stock_all["Month"] == prev_m]["Holding Value Crore"].sum()
                    diff = val_latest - val_prev
                    fund_changes[fc_code] = diff
                
                accumulating_funds = [fc for fc, diff in fund_changes.items() if diff > 0.0001]
                reducing_funds = [fc for fc, diff in fund_changes.items() if diff < -0.0001]
                
                if len(accumulating_funds) > 0 and len(reducing_funds) > 0:
                    is_divergent = True
                    divergent_details = {
                        "accumulating_funds": accumulating_funds,
                        "reducing_funds": reducing_funds
                    }

            # Funds list holding this stock in the latest month across all schemes
            all_holding_df = self._cached_df[(self._cached_df["ISIN"] == isin) & (self._cached_df["Month"] == latest_m_global) & (self._cached_df["Holding Value Crore"] > 0)]
            holding_funds = all_holding_df["Fund Code"].unique().tolist()
            if not holding_funds:
                all_holding_df = self._cached_df[(self._cached_df["Stock Name"] == name) & (self._cached_df["Month"] == latest_m_global) & (self._cached_df["Holding Value Crore"] > 0)]
                holding_funds = all_holding_df["Fund Code"].unique().tolist()

            # Overall stock count across all schemes in dataset
            stock_k = isin.upper().strip() if (isin and isin.strip()) else self._normalize_name(name)
            stock_appearance_count = stock_total_counts.get(stock_k, 1)

            analytics_list.append({
                "fund_code": f_code,
                "mutual_fund": f_name,
                "mf_category": f_cat,
                "isin": isin,
                "stock_name": name,
                "symbol": symbol,
                "industry": industry,
                "count": stock_appearance_count,
                "status": status,
                "latest_quantity": month_values[latest_idx]["quantity"],
                "latest_value_crore": latest_val,
                "latest_ltp": month_values[latest_idx]["ltp"],
                "pct_nav": month_values[latest_idx]["pct_nav"],
                "change_1m_crore": change_1m,
                "change_1m_pct": pct_change_1m,
                "change_2m_crore": change_2m,
                "change_2m_pct": pct_change_2m,
                "change_3m_crore": change_3m,
                "change_3m_pct": pct_change_3m,
                "inc_2m": inc_2m,
                "dec_2m": dec_2m,
                "inc_3m": inc_3m,
                "dec_3m": dec_3m,
                "consistent_5m": consistent_5m,
                "trend_5m": trend_5m,
                "portfolio_signal": signal,
                "holding_funds": holding_funds,
                "accumulating_funds": accumulating_funds,
                "reducing_funds": reducing_funds,
                "is_divergent": is_divergent,
                "divergent_details": divergent_details,
                "month_values": {months[i]: month_values[i] for i in range(len(months))}
            })

        return analytics_list

    def get_common_holdings(self, min_funds: int = 2) -> List[Dict[str, Any]]:
        """
        Returns stocks held by at least `min_funds` mutual funds in the latest month.
        """
        analytics = self.compute_analytics("ALL")
        common = [a for a in analytics if len(a["holding_funds"]) >= min_funds]
        # Sort by latest value desc
        common.sort(key=lambda x: x["latest_value_crore"], reverse=True)
        return common

    def get_common_accumulation(self) -> List[Dict[str, Any]]:
        """
        Identify stocks where at least two mutual funds increased their holding in the latest month.
        """
        self._load_and_process()
        df = self._cached_df
        months = self.get_available_months()
        if len(months) < 2:
            return []

        latest_m = months[-1]
        prev_m = months[-2]

        stock_groups = df.groupby(["ISIN", "Stock Name", "Stock Name.1", "Industry"]).groups
        accumulation_list = []

        for (isin, name, symbol, industry) in stock_groups.keys():
            stock_df = df[(df["ISIN"] == isin) & (df["Stock Name"] == name)]
            
            accumulating_funds = []
            combined_increase_crore = 0.0

            for f_name, f_code in FUND_NAME_TO_CODE.items():
                f_stock = stock_df[stock_df["Fund Code"] == f_code]
                val_latest = f_stock[f_stock["Month"] == latest_m]["Holding Value Crore"].sum()
                val_prev = f_stock[f_stock["Month"] == prev_m]["Holding Value Crore"].sum()
                
                diff = val_latest - val_prev
                if diff > 0.0001:
                    accumulating_funds.append(f_code)
                    combined_increase_crore += diff

            if len(accumulating_funds) >= 2:
                accumulation_list.append({
                    "isin": isin,
                    "stock_name": name,
                    "symbol": symbol,
                    "industry": industry,
                    "accumulating_funds_count": len(accumulating_funds),
                    "accumulating_funds": accumulating_funds,
                    "combined_increase_crore": combined_increase_crore
                })

        # Sort by combined increase desc
        accumulation_list.sort(key=lambda x: x["combined_increase_crore"], reverse=True)
        return accumulation_list

    def get_unmatched_stocks_report(self, live_holdings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Generates a list of live holdings that failed to match any mutual fund stock,
        as well as matching details for all live holdings.
        """
        self._load_and_process()
        df = self._cached_df
        latest_m = self.get_latest_month()
        
        # Get unique mutual fund stocks in the latest month
        latest_mf_df = df[df["Month"] == latest_m]
        mf_stocks = latest_mf_df[["ISIN", "Stock Name", "Stock Name.1", "Industry", "Mutual Fund", "Fund Code"]].to_dict("records")

        report = []
        for lh in live_holdings:
            matched_mf = None
            match_type = None

            # Try to match the live holding against latest mutual fund stocks
            for mf in mf_stocks:
                match = self.match_stock(mf, [lh])
                if match:
                    matched_mf = mf
                    # Determine match type based on conditions
                    if mf.get("ISIN") == lh.get("isin"):
                        match_type = "ISIN Match"
                    elif str(mf.get("Stock Name.1")).strip().upper() == (lh.get("script", "")[:-3] if lh.get("script", "").endswith("-EQ") else lh.get("script", "")).strip().upper():
                        match_type = "Symbol Match"
                    elif self._normalize_name(mf.get("Stock Name")) == self._normalize_name(lh.get("script", "")[:-3] if lh.get("script", "").endswith("-EQ") else lh.get("script", "")):
                        match_type = "Name Match"
                    else:
                        match_type = "Manual Map"
                    break

            report.append({
                "live_scrip": lh.get("script"),
                "broker": lh.get("broker"),
                "quantity": lh.get("quantity"),
                "avg_price": lh.get("avg_price"),
                "ltp": lh.get("ltp"),
                "is_matched": matched_mf is not None,
                "matched_fund_name": matched_mf["Mutual Fund"] if matched_mf else None,
                "matched_fund_code": matched_mf["Fund Code"] if matched_mf else None,
                "matched_stock_name": matched_mf["Stock Name"] if matched_mf else None,
                "match_type": match_type
            })

        return report

    def _build_holdings_match_index(self) -> Dict[str, List[Dict[str, Any]]]:
        """
        Pre-indexes all stock records for the latest month into a high-speed lookup map.
        Keyed by: ISIN, Symbol (without -EQ and with -EQ), and normalized stock name.
        """
        df = self._cached_df
        months = self.get_available_months()
        if not months or df is None:
            return {}
        latest_m = months[-1]
        latest_mf_df = df[df["Month"] == latest_m]
        
        # Precompute stock historical lookup table
        # Group by ISIN + Fund Code + Month, and Normalized Stock Name + Fund Code + Month
        hist_by_isin = df[df["ISIN"].notna()].groupby(["ISIN", "Fund Code", "Month"])["Holding Value Crore"].sum().to_dict()
        hist_by_name = df.groupby(["Normalized Stock Name", "Fund Code", "Month"])["Holding Value Crore"].sum().to_dict()
        
        # Unique stocks in latest month per fund
        latest_records = latest_mf_df.to_dict("records")
        
        # Group by unique ISIN (if available) or Normalized Stock Name
        stock_fund_map = {}
        for r in latest_records:
            isin = str(r.get("ISIN") or "").strip().upper()
            stock_name = str(r.get("Stock Name") or "").strip()
            norm_name = str(r.get("Normalized Stock Name") or self._normalize_name(stock_name))
            symbol = str(r.get("Stock Name.1") or "").strip()
            f_code = r.get("Fund Code")
            f_name = r.get("Mutual Fund")
            f_cat = r.get("MF Category") or ("Value" if f_code in ["HV", "HS", "IC"] else "Flexicap")
            
            key = isin if isin else norm_name
            if key not in stock_fund_map:
                stock_fund_map[key] = {
                    "isin": isin,
                    "stock_name": stock_name,
                    "norm_name": norm_name,
                    "symbols": set([symbol]) if symbol else set(),
                    "funds": []
                }
            else:
                if symbol:
                    stock_fund_map[key]["symbols"].add(symbol)
                
            val_latest = float(r.get("Holding Value Crore")) if pd.notna(r.get("Holding Value Crore")) else 0.0
            
            def get_hist(m_key):
                if isin and (isin, f_code, m_key) in hist_by_isin:
                    return hist_by_isin.get((isin, f_code, m_key), 0.0)
                return hist_by_name.get((norm_name, f_code, m_key), 0.0)

            val_prev  = get_hist(months[-2]) if len(months) >= 2 else 0.0
            val_prev2 = get_hist(months[-3]) if len(months) >= 3 else 0.0
            val_prev3 = get_hist(months[-4]) if len(months) >= 4 else 0.0
            val_prev4 = get_hist(months[-5]) if len(months) >= 5 else 0.0
            
            change_1m = val_latest - val_prev
            change_1m_pct = ((val_latest - val_prev) / val_prev * 100.0) if val_prev > 0.0001 else 0.0
            if val_prev <= 0.0001 and val_latest > 0.0001:
                change_1m_pct = 0.0

            change_2m = val_latest - val_prev2
            change_2m_pct = ((val_latest - val_prev2) / val_prev2 * 100.0) if val_prev2 > 0.0001 else 0.0
            if val_prev2 <= 0.0001 and val_latest > 0.0001:
                change_2m_pct = 0.0

            change_3m = val_latest - val_prev3
            change_3m_pct = ((val_latest - val_prev3) / val_prev3 * 100.0) if val_prev3 > 0.0001 else 0.0
            if val_prev3 <= 0.0001 and val_latest > 0.0001:
                change_3m_pct = 0.0
            
            if val_prev <= 0.0001 and val_latest > 0.0001:
                trend_3m = "New Entry"
            else:
                if val_latest > val_prev + 0.0001 and val_prev > val_prev2 + 0.0001:
                    trend_3m = "Accumulating"
                elif val_latest < val_prev - 0.0001 and val_prev < val_prev2 - 0.0001:
                    trend_3m = "Reducing"
                elif abs(val_latest - val_prev) < 0.0001 and abs(val_prev - val_prev2) < 0.0001:
                    trend_3m = "Stable"
                else:
                    trend_3m = "Mixed"

            inc_3m = False
            dec_3m = False
            if len(months) >= 4:
                if val_latest > val_prev + 0.0001 and val_prev > val_prev2 + 0.0001 and val_prev2 > val_prev3 + 0.0001:
                    inc_3m = True
                elif val_latest < val_prev - 0.0001 and val_prev < val_prev2 - 0.0001 and val_prev2 < val_prev3 - 0.0001:
                    dec_3m = True

            consistent_5m = False
            trend_5m = "N/A"
            if len(months) >= 5:
                vals = [val_prev4, val_prev3, val_prev2, val_prev, val_latest]
                if all(v > 0.0001 for v in vals):
                    consistent_5m = True
                    avg_val = sum(vals) / 5.0
                    max_val = max(vals)
                    min_val = min(vals)
                    rel_tol = avg_val * STABLE_RELATIVE_TOLERANCE
                    tol = max(rel_tol, STABLE_ABSOLUTE_TOLERANCE)
                    if (max_val - min_val) <= tol:
                        trend_5m = "Stable"
                    else:
                        increases = 0
                        decreases = 0
                        for i in range(1, 5):
                            if vals[i] > vals[i-1] + 0.0001:
                                increases += 1
                            elif vals[i] < vals[i-1] - 0.0001:
                                decreases += 1
                        if vals[-1] > vals[0] + 0.0001 and increases > decreases:
                            trend_5m = "Gradually Increasing"
                        elif vals[-1] < vals[0] - 0.0001 and decreases > increases:
                            trend_5m = "Gradually Decreasing"
                        else:
                            trend_5m = "Mixed"

            portfolio_signal = "Stable Holding" if (consistent_5m and trend_5m == "Stable") else "Active"
            if val_prev <= 0.0001:
                portfolio_signal = "New Entry"
            elif inc_3m:
                portfolio_signal = "Strong Accumulation"
            elif val_latest > val_prev + 0.0001:
                portfolio_signal = "Accumulating"
            elif dec_3m:
                portfolio_signal = "Strong Reduction"
            elif val_latest < val_prev - 0.0001:
                portfolio_signal = "Reducing"
                    
            stock_fund_map[key]["funds"].append({
                "fund_code": f_code,
                "fund_name": f_name,
                "mf_category": f_cat,
                "latest_value": val_latest,
                "change_1m": change_1m,
                "change_1m_pct": change_1m_pct,
                "change_2m": change_2m,
                "change_2m_pct": change_2m_pct,
                "change_3m": change_3m,
                "change_3m_pct": change_3m_pct,
                "trend_3m": trend_3m,
                "portfolio_signal": portfolio_signal
            })

        # Build index mapping multiple identifier variations to fund list
        lookup = {}
        for item in stock_fund_map.values():
            funds = item["funds"]
            isin = item["isin"]
            norm_name = item["norm_name"]
            
            if isin:
                lookup[isin] = funds
            if norm_name:
                lookup[norm_name] = funds
            for sym in item["symbols"]:
                sym_clean = sym.upper().strip()
                if sym_clean:
                    lookup[sym_clean] = funds
                    lookup[f"{sym_clean}-EQ"] = funds
                
        return lookup

    def get_matching_funds_for_holdings(self, live_holdings: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """
        For each live holding, returns a list of mutual funds holding it in the latest month.
        Uses fast pre-indexed memory lookup for instant O(1) execution.
        """
        self._load_and_process()
        if not hasattr(self, "_cached_match_index") or self._cached_match_index is None:
            self._cached_match_index = self._build_holdings_match_index()
            
        index = self._cached_match_index
        matches = {}
        
        for lh in live_holdings:
            scrip = lh.get("script", "")
            if not scrip:
                continue
                
            clean_scrip = scrip[:-3] if scrip.endswith("-EQ") else scrip
            isin = (lh.get("isin") or "").upper().strip()
            
            # Lookup order: ISIN -> scrip -> clean_scrip -> normalized name -> manual map
            matched_funds = None
            if isin and isin in index:
                matched_funds = index[isin]
            elif scrip.upper() in index:
                matched_funds = index[scrip.upper()]
            elif clean_scrip.upper() in index:
                matched_funds = index[clean_scrip.upper()]
            else:
                norm = self._normalize_name(clean_scrip)
                if norm in index:
                    matched_funds = index[norm]
                elif clean_scrip in MANUAL_STOCK_MAP:
                    mapped = MANUAL_STOCK_MAP[clean_scrip]
                    matched_funds = index.get(mapped.upper()) or index.get(self._normalize_name(mapped))
                    
            matches[scrip] = matched_funds or []
            
        return matches
