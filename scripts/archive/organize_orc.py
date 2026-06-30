import os
import shutil
from PIL import Image

src_dir = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Orc\Frames"
base_dir = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Orc"

folders = [
    "Walk Right", "Walk Left", "Idle Right", "Idle Left", "Attack Right", "Attack Left"
]

for folder in folders:
    os.makedirs(os.path.join(base_dir, folder), exist_ok=True)

for i in range(1, 5):
    src = os.path.join(src_dir, f"orc_frame_{i:02d}.png")
    if os.path.exists(src):
        shutil.copy(src, os.path.join(base_dir, "Walk Right", f"orc_frame_{i:02d}.png"))

for i in range(5, 9):
    src = os.path.join(src_dir, f"orc_frame_{i:02d}.png")
    if os.path.exists(src):
        shutil.copy(src, os.path.join(base_dir, "Walk Left", f"orc_frame_{i:02d}.png"))

for i in range(9, 13):
    src = os.path.join(src_dir, f"orc_frame_{i:02d}.png")
    if os.path.exists(src):
        dest_right = os.path.join(base_dir, "Idle Right", f"orc_frame_{i:02d}.png")
        shutil.copy(src, dest_right)
        
        dest_left = os.path.join(base_dir, "Idle Left", f"orc_frame_{i:02d}.png")
        img = Image.open(src)
        img_flipped = img.transpose(Image.FLIP_LEFT_RIGHT)
        img_flipped.save(dest_left, "PNG")

for i in range(13, 17):
    src = os.path.join(src_dir, f"orc_frame_{i:02d}.png")
    if os.path.exists(src):
        dest_right = os.path.join(base_dir, "Attack Right", f"orc_frame_{i:02d}.png")
        shutil.copy(src, dest_right)
        
        dest_left = os.path.join(base_dir, "Attack Left", f"orc_frame_{i:02d}.png")
        img = Image.open(src)
        img_flipped = img.transpose(Image.FLIP_LEFT_RIGHT)
        img_flipped.save(dest_left, "PNG")

print("Orc frames organized and flipped successfully!")
