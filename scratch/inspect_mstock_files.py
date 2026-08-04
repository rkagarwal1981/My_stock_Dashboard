import sys
import pandas as pd
import os

sys.stdout.reconfigure(encoding='utf-8')
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ledger_2526_path = os.path.join(root_dir, "MA108170_Ledger_Report (25-26).xlsx")
tax_2526_path = os.path.join(root_dir, "Tax_PNL_Mstock (25-26).xlsx")

print("--- LEDGER 25-26 ---")
if os.path.exists(ledger_2526_path):
    xl = pd.ExcelFile(ledger_2526_path)
    print("Sheets:", xl.sheet_names)
    df = pd.read_excel(ledger_2526_path, sheet_name=xl.sheet_names[0])
    print("Shape:", df.shape)
    # Check headers
    header_idx = None
    for idx, row in df.iterrows():
        if row.iloc[0] == 'Date' and row.iloc[1] == 'Description':
            header_idx = idx
            break
    print("Header row index:", header_idx)
    if header_idx is not None:
        print("Header content:", list(df.iloc[header_idx]))
        print("First 3 data rows:")
        print(df.iloc[header_idx+1:header_idx+4].to_string())
else:
    print("Ledger 25-26 not found!")

print("\n--- TAX PNL 25-26 ---")
if os.path.exists(tax_2526_path):
    xl = pd.ExcelFile(tax_2526_path)
    print("Sheets:", xl.sheet_names)
    if "EQUITY" in xl.sheet_names:
        df_eq = pd.read_excel(tax_2526_path, sheet_name="EQUITY")
        print("Shape:", df_eq.shape)
        header_idx = None
        for idx, row in df_eq.iterrows():
            if row.iloc[0] == 'Scrip Name' and row.iloc[6] == 'Sell Date':
                header_idx = idx
                break
        print("Header row index:", header_idx)
        if header_idx is not None:
            print("Header content:", list(df_eq.iloc[header_idx]))
            print("First 3 data rows:")
            print(df_eq.iloc[header_idx+1:header_idx+4].to_string())
else:
    print("Tax PNL 25-26 not found!")
