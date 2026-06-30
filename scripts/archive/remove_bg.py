import os
from PIL import Image

in_dir = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Goblin\Frames"
out_dir = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Goblin\Frames_Transparent"

os.makedirs(out_dir, exist_ok=True)

def remove_green_screen(img_path, out_path):
    img = Image.open(img_path).convert("RGBA")
    datas = img.getdata()
    
    new_data = []
    for item in datas:
        # Chroma key is #00FF00 (0, 255, 0). We add a tolerance threshold for AI generated images.
        if item[0] < 50 and item[1] > 200 and item[2] < 50:
            new_data.append((0, 0, 0, 0)) # transparent
        else:
            new_data.append(item)
            
    img.putdata(new_data)
    img.save(out_path, "PNG")

for i in range(1, 17):
    frame_name = f"goblin_frame_{i:02d}.png"
    in_path = os.path.join(in_dir, frame_name)
    out_path = os.path.join(out_dir, frame_name)
    if os.path.exists(in_path):
        remove_green_screen(in_path, out_path)
        print(f"Processed {frame_name}")
    else:
        print(f"File not found: {in_path}")

print("Background removal complete.")
