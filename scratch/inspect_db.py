import sqlite3
import pandas as pd

conn = sqlite3.connect("database/portfolio.db")

print("--- PIIND 2026-07-22 TRANSACTIONS IN DB ---")
df = pd.read_sql_query("SELECT id, transaction_date, quantity, price, order_number, import_id FROM transactions WHERE script LIKE '%PIIND%' AND transaction_date LIKE '%2026-07-22%' ORDER BY id ASC;", conn)
print(df)

print(f"\nTotal transactions count for 2026-07-22: {len(df)}")
print(f"Total sell quantity for 2026-07-22: {df['quantity'].sum()}")

print("\n--- HOLDING DETAILS FOR PIIND-EQ ---")
df_h = pd.read_sql_query("SELECT * FROM holdings WHERE script LIKE '%PIIND%';", conn)
print(df_h)

conn.close()
