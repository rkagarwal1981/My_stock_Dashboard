import openpyxl
import pandas as pd
import glob
import os

print("Excel files in workspace:")
for fn in glob.glob("*.xlsx"):
    print("-", fn)
    try:
        xl = pd.ExcelFile(fn)
        print("  Sheets:", xl.sheet_names)
        for sheet in xl.sheet_names:
            df = pd.read_excel(fn, sheet_name=sheet, nrows=5)
            print(f"    Sheet: {sheet}, Columns: {list(df.columns)}")
    except Exception as e:
        print("  Error:", e)
