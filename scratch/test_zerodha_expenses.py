import urllib.request, json

# Get a JWT token first
data = json.dumps({'username': 'admin', 'password': 'admin'}).encode()
req = urllib.request.Request('http://127.0.0.1:8000/api/auth/login', data=data, headers={'Content-Type': 'application/json'})
resp = urllib.request.urlopen(req, timeout=5)
token = json.loads(resp.read())['access_token']

# Now call the expenses endpoint for Zerodha
req2 = urllib.request.Request('http://127.0.0.1:8000/api/analytics/expenses-interest?broker=Zerodha', headers={'Authorization': f'Bearer {token}'})
resp2 = urllib.request.urlopen(req2, timeout=15)
result = json.loads(resp2.read())

print('zerodha_files_exist:', result.get('zerodha_files_exist'))
print('Months with non-zero expense data:')
for m in result.get('months', []):
    if any(v != 0 for v in [m['mtf_interest'], m['dp_charges'], m.get('pledge_charges', 0), m['brokerage'], m['tax_other_stt']]):
        print(f"  {m['month']}: MTF={m['mtf_interest']}, DP={m['dp_charges']}, Pledge={m.get('pledge_charges',0)}, Brok={m['brokerage']}, Tax={m['tax_other_stt']}, NetPnl={m['actual_net_pnl']}, MTFPos={m['mtf_position']}")
