import os
from PIL import Image

base_dir = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Goblin"

for root, dirs, files in os.walk(base_dir):
    for file in files:
        if file.endswith(".png"):
            img_path = os.path.join(root, file)
            img = Image.open(img_path)
            bbox = img.getbbox()
            if bbox:
                print(f"{os.path.basename(root)}/{file}: bbox {bbox} - Bottom Y: {bbox[3]} - Center X: {(bbox[0] + bbox[2])//2}")
