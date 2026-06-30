import os
import math
from PIL import Image

src_img = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Slime\22f15ce1-1e38-4fab-bb05-c915b3775563.jpg"
base_dir = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Slime"

folders_to_clear = ["Walk right", "Walk left", "Idle right", "Idle left", "Attack right", "Attack left", "Death right", "Death left"]
for folder in folders_to_clear:
    path = os.path.join(base_dir, folder)
    os.makedirs(path, exist_ok=True)
    for f in os.listdir(path):
        if f.endswith(".png"):
            os.remove(os.path.join(path, f))

img = Image.open(src_img).convert("RGBA")
width, height = img.size
cols, rows = 4, 4
frame_w, frame_h = width // cols, height // rows

bg_color = (151, 226, 48)

def color_dist(c1, c2):
    return math.sqrt((c1[0]-c2[0])**2 + (c1[1]-c2[1])**2 + (c1[2]-c2[2])**2)

frames = []
for row in range(rows):
    for col in range(cols):
        left, upper = col * frame_w, row * frame_h
        right, lower = left + frame_w, upper + frame_h
        frame = img.crop((left, upper, right, lower))
        
        datas = list(frame.getdata())
        new_data = []
        for y in range(frame_h):
            for x in range(frame_w):
                item = datas[y * frame_w + x]
                # Wipe the outer 30 pixels completely to destroy the bleeding grid lines
                if x < 30 or x >= frame_w - 30 or y < 30 or y >= frame_h - 30:
                    new_data.append((0, 0, 0, 0))
                # Remove background green strictly
                elif color_dist(item, bg_color) < 55:
                    new_data.append((0, 0, 0, 0))
                else:
                    new_data.append(item)
        frame.putdata(new_data)
        
        bbox = frame.getbbox()
        if bbox:
            center_x = (bbox[0] + bbox[2]) // 2
            offset_x = (frame_w // 2) - center_x
            new_img = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
            new_img.paste(frame, (offset_x, 0))
            frame = new_img
            
        frames.append(frame)

animations = ["Idle", "Walk", "Attack", "Death"]
for row, anim in enumerate(animations):
    for col in range(4):
        idx = row * 4 + col
        frames[idx].save(os.path.join(base_dir, f"{anim} right", f"{col+1}.png"), "PNG")
        
        f_left = frames[idx].transpose(Image.FLIP_LEFT_RIGHT)
        f_left.save(os.path.join(base_dir, f"{anim} left", f"{col+1}.png"), "PNG")

print("Slime cleanly processed with cropped borders!")
