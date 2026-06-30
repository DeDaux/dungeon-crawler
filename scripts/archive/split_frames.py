import sys
import os
import subprocess

def install_and_import(package):
    try:
        import PIL
    except ImportError:
        print(f"Installing {package}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", package])
    finally:
        globals()["Image"] = __import__("PIL.Image", fromlist=["Image"])

install_and_import("Pillow")

img_path = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Goblin\goblin_sprite_sheet.png"
out_dir = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Goblin\Frames"

os.makedirs(out_dir, exist_ok=True)

try:
    img = Image.open(img_path)
    width, height = img.size
    
    # The generated image is a 4x4 grid, not 1x16
    cols = 4
    rows = 4
    frame_width = width // cols
    frame_height = height // rows

    frame_index = 1
    for row in range(rows):
        for col in range(cols):
            left = col * frame_width
            upper = row * frame_height
            right = (col + 1) * frame_width
            lower = (row + 1) * frame_height
            
            frame = img.crop((left, upper, right, lower))
            frame_name = f"goblin_frame_{frame_index:02d}.png"
            frame_path = os.path.join(out_dir, frame_name)
            frame.save(frame_path)
            print(f"Saved {frame_name}")
            frame_index += 1
            
    print("All frames extracted successfully.")
except Exception as e:
    print(f"Error: {e}")
