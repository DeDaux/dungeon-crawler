import os
from PIL import Image

base_dir = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Goblin"

for root, dirs, files in os.walk(base_dir):
    for file in files:
        if file.endswith(".png"):
            img_path = os.path.join(root, file)
            img = Image.open(img_path).convert("RGBA")
            bbox = img.getbbox()
            if bbox:
                width, height = img.size
                center_x = (bbox[0] + bbox[2]) // 2
                target_center_x = width // 2
                
                offset_x = target_center_x - center_x
                
                new_img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
                new_img.paste(img, (offset_x, 0))
                
                new_img.save(img_path, "PNG")
                print(f"Centered {file} (Shifted by {offset_x} pixels)")

print("All frames centered horizontally.")
