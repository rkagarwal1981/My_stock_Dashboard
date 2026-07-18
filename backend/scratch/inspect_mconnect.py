from tradingapi_a.mconnect import MConnect
import inspect

print("--- MConnect Methods ---")
for name, member in inspect.getmembers(MConnect):
    if not name.startswith("_"):
        print(f"{name}: {inspect.formatannotation(member) if hasattr(member, '__annotations__') else 'Method/Property'}")
