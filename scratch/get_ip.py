import urllib.request
try:
    ip = urllib.request.urlopen('https://api.ipify.org').read().decode('utf8')
    print(f"Public IP: {ip}")
except Exception as e:
    print(f"Error fetching IP: {e}")
