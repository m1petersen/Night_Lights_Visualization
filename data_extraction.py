import io
import time
import requests
import numpy as np
import pandas as pd
from PIL import Image

# --- CONFIGURATION ---
GIBS_WMS_ENDPOINT = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
LAYER_TO_USE = "VIIRS_SNPP_DayNightBand"
REGION_BBOX = (-125, 24, -66, 50) # United States
GLOW_THRESHOLD = 0.35

def fetch_gibs_wms_image(layer, date, bbox=REGION_BBOX, width=600, height=400, image_format="image/png", timeout=30):
    lon_min, lat_min, lon_max, lat_max = bbox
    params = {
        "SERVICE": "WMS",
        "REQUEST": "GetMap",
        "VERSION": "1.1.1",
        "LAYERS": layer,
        "STYLES": "",
        "FORMAT": image_format,
        "TRANSPARENT": "TRUE",
        "SRS": "EPSG:4326",
        "BBOX": f"{lon_min},{lat_min},{lon_max},{lat_max}",
        "WIDTH": width,
        "HEIGHT": height,
        "TIME": date,
    }
    response = requests.get(GIBS_WMS_ENDPOINT, params=params, timeout=timeout)
    response.raise_for_status()
    return Image.open(io.BytesIO(response.content)).convert("RGBA")

def image_to_rgb_array(img):
    arr = np.asarray(img).astype(float) / 255.0
    return arr[:, :, :3]

# --- 1. GENERATE MONTHLY DATES (May 2012 - April 2026) ---
# 'MS' is Month Start. Adding 14 days targets the 15th of each month.
date_range = pd.date_range(start="2012-05-01", end="2026-04-01", freq="MS") + pd.Timedelta(days=14)
available_dates = date_range.strftime('%Y-%m-%d').tolist()

print(f"Starting extraction for {len(available_dates)} dates. This will take a few minutes...\n")

metrics = []

# --- 2. FETCH IMAGES & CALCULATE METRICS ---
for date in available_dates:
    try:
        # Fetching at 600x400 to perfectly match the D3 map dimensions
        img = fetch_gibs_wms_image(layer=LAYER_TO_USE, date=date, width=600, height=400)
        
        arr = image_to_rgb_array(img)
        brightness = arr.mean(axis=2)
        bright_mask = brightness > GLOW_THRESHOLD
        
        metrics.append({
            "date": date,
            "mean_brightness": brightness.mean(),
            "max_brightness": brightness.max(),
            "bright_pixel_ratio": bright_mask.mean()
        })
        
        print(f"Successfully processed {date}")
        time.sleep(0.5) # Polite pause to avoid hitting API rate limits
        
    except Exception as e:
        print(f"Skipping {date} due to error: {e}")

# --- 3. EXPORT TO CSV ---
metrics_df = pd.DataFrame(metrics)
metrics_df.to_csv("nightlight_metrics.csv", index=False)

print("\nData saved to 'nightlight_metrics.csv'.")