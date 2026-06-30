import os
from PIL import Image

src_img = r"C:\Users\bauzy\.gemini\antigravity\brain\90a55268-e8bf-4462-a0be-993ea8abce5a\orc_walk_idle_axe_v2_1780169179677.png"
base_dir = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Orc"

folders_to_clear = ["Walk right", "Walk left", "Idle right", "Idle left"]
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
                if x < 8 or x >= frame_w - 8 or y < 8 or y >= frame_h - 8:
                    new_data.append((0, 0, 0, 0))
                else:
                    if item[0] < 50 and item[1] > 200 and item[2] < 50:
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

for i in range(4):
    frames[i].save(os.path.join(base_dir, "Walk right", f"orc_frame_{i+1:02d}.png"), "PNG")

for i in range(4):
    frames[8+i].save(os.path.join(base_dir, "Idle right", f"orc_frame_{i+9:02d}.png"), "PNG")

for i in range(4):
    f_walk = frames[i].transpose(Image.FLIP_LEFT_RIGHT)
    f_walk.save(os.path.join(base_dir, "Walk left", f"orc_frame_{i+5:02d}.png"), "PNG")
    
    f_idle = frames[8+i].transpose(Image.FLIP_LEFT_RIGHT)
    f_idle.save(os.path.join(base_dir, "Idle left", f"orc_frame_{i+9:02d}.png"), "PNG")

print("Walk and Idle frames processed and distributed into Orc folders!")
