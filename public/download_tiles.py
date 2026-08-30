"""
Run this script ONCE on your own computer (needs Python 3 + internet).
It downloads the 56 map tiles (light + dark) for the Pakistan region
and saves them into a 'tiles' folder.

Usage:
  1. Open a terminal in your project root (where 'public/' is)
  2. Run:  python download_tiles.py
  3. It creates  public/tiles/light/...  and  public/tiles/dark/...
  4. Commit the tiles folder to your repo
  5. Done - the map now loads from your own server
"""

import urllib.request
import os
import math
import time

def lat_lon_to_tile(lat, lon, zoom):
    n = 2 ** zoom
    x = int((lon + 180) / 360 * n)
    lat_rad = math.radians(lat)
    y = int((1 - math.log(math.tan(lat_rad) + 1/math.cos(lat_rad)) / math.pi) / 2 * n)
    return x, y

themes = {
    "light": "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    "dark": "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
}

# Pakistan bounds with padding
lat_min, lat_max = 22, 39
lon_min, lon_max = 58, 80

count = 0
errors = 0

for theme_name, url_template in themes.items():
    for zoom in [4, 5, 6]:
        x_min, y_max = lat_lon_to_tile(lat_min, lon_min, zoom)
        x_max, y_min = lat_lon_to_tile(lat_max, lon_max, zoom)
        for x in range(x_min, x_max + 1):
            for y in range(y_min, y_max + 1):
                out_dir = os.path.join("public", "tiles", theme_name, str(zoom), str(x))
                os.makedirs(out_dir, exist_ok=True)
                out_path = os.path.join(out_dir, f"{y}.png")
                if os.path.exists(out_path):
                    print(f"  SKIP (exists): {out_path}")
                    count += 1
                    continue
                url = url_template.replace("{z}", str(zoom)).replace("{x}", str(x)).replace("{y}", str(y))
                try:
                    urllib.request.urlretrieve(url, out_path)
                    count += 1
                    print(f"  OK: {out_path}")
                    time.sleep(0.1)
                except Exception as e:
                    errors += 1
                    print(f"  FAIL: {url} -> {e}")

print(f"\nDone! Downloaded {count} tiles, {errors} errors.")
print("Now commit the public/tiles/ folder to your repo.")
