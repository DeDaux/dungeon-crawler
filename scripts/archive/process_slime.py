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

# Wipe the outer 15 pixels of the entire image to destroy the black border
datas = list(img.getdata())
new_data = []
for y in range(height):
    for x in range(width):
        item = datas[y * width + x]
        if x < 15 or x >= width - 15 or y < 15 or y >= height - 15:
            new_data.append((0, 0, 0, 0))
        else:
            new_data.append(item)
img.putdata(new_data)

cols, rows = 4, 4
frame_w, frame_h = width // cols, height // rows

bg_color = (151, 226, 48)

def color_distance(c1, c2):
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(c1[:3], c2[:3])))

frames = []
for row in range(rows):
    for col in range(cols):
        left, upper = col * frame_w, row * frame_h
        right, lower = left + frame_w, upper + frame_h
        frame = img.crop((left, upper, right, lower))
        
        f_datas = list(frame.getdata())
        f_new_data = []
        for item in f_datas:
            if item[3] == 0:
                f_new_data.append(item)
            elif color_distance(item, bg_color) < 70:
                f_new_data.append((0, 0, 0, 0))
            else:
                f_new_data.append(item)
        frame.putdata(f_new_data)
        
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

print("Slime frames processed!")
