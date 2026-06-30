import os
from PIL import Image

src_dir = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Goblin\Idle Right"
dest_dir = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Goblin\Idle Left"

os.makedirs(dest_dir, exist_ok=True)

for file in os.listdir(src_dir):
    if file.endswith(".png"):
        img_path = os.path.join(src_dir, file)
        dest_path = os.path.join(dest_dir, file)
        
        img = Image.open(img_path)
        img_flipped = img.transpose(Image.FLIP_LEFT_RIGHT)
        img_flipped.save(dest_path, "PNG")
        print(f"Created {file} in Idle Left")

print("Idle Left frames generated successfully.")
