import os
from PIL import Image

base_dir = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Orc"

def flip_frames(src_folder, dest_folder):
    src_path = os.path.join(base_dir, src_folder)
    dest_path = os.path.join(base_dir, dest_folder)
    
    os.makedirs(dest_path, exist_ok=True)
    
    if not os.path.exists(src_path):
        print(f"Error: Source folder '{src_folder}' not found.")
        return

    for file in os.listdir(src_path):
        if file.endswith(".png"):
            s_file = os.path.join(src_path, file)
            d_file = os.path.join(dest_path, file)
            
            img = Image.open(s_file)
            img_flipped = img.transpose(Image.FLIP_LEFT_RIGHT)
            img_flipped.save(d_file, "PNG")
            print(f"Flipped {file} into {dest_folder}")

flip_frames("Idle right", "Idle left")
flip_frames("Attack Right", "Attack left")

print("Flipping completed!")
