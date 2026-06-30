import os
from PIL import Image

base_dir = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Orc"
folders = ["Walk right", "Walk left", "Idle right", "Idle left", "Attack right", "Attack left"]

for folder in folders:
    folder_path = os.path.join(base_dir, folder)
    if not os.path.exists(folder_path): continue
    
    for filename in os.listdir(folder_path):
        if not filename.endswith(".png"): continue
        
        file_path = os.path.join(folder_path, filename)
        img = Image.open(file_path).convert("RGBA")
        datas = img.getdata()
        
        new_data = []
        for item in datas:
            r, g, b, a = item
            # Target bright and dark neon green fringing, while ignoring olive green Orc skin
            # Neon green has low R and B relative to G.
            if a > 0 and g > 30 and r < g * 0.75 and b < g * 0.75:
                new_data.append((0, 0, 0, 0))
            else:
                new_data.append(item)
                
        img.putdata(new_data)
        img.save(file_path, "PNG")
        print(f"Cleaned {filename} in {folder}")

print("Green fringing cleanup complete!")
