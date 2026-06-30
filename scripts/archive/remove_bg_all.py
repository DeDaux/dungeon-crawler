import os
from PIL import Image

base_dir = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Goblin"

def remove_green_screen(img_path):
    img = Image.open(img_path).convert("RGBA")
    datas = img.getdata()
    
    new_data = []
    for item in datas:
        # Chroma key #00FF00 tolerance
        if item[0] < 50 and item[1] > 200 and item[2] < 50:
            new_data.append((0, 0, 0, 0)) # transparent
        else:
            new_data.append(item)
            
    img.putdata(new_data)
    img.save(img_path, "PNG")

for root, dirs, files in os.walk(base_dir):
    for file in files:
        if file.endswith(".png"):
            img_path = os.path.join(root, file)
            print(f"Processing {img_path}")
            remove_green_screen(img_path)

print("Background removal complete.")
