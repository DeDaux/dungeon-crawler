import os
from PIL import Image

src_img = r"C:\Users\bauzy\.gemini\antigravity\brain\90a55268-e8bf-4462-a0be-993ea8abce5a\orc_smooth_attack_frames_1780168539093.png"
dest_dir = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Orc\Attack right"

os.makedirs(dest_dir, exist_ok=True)

for filename in os.listdir(dest_dir):
    if filename.endswith(".png"):
        os.remove(os.path.join(dest_dir, filename))

img = Image.open(src_img).convert("RGBA")
width, height = img.size
cols, rows = 4, 4
frame_w, frame_h = width // cols, height // rows

frame_idx = 1
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
        
        frame_path = os.path.join(dest_dir, f"orc_attack_{frame_idx:02d}.png")
        frame.save(frame_path, "PNG")
        print(f"Processed and saved orc_attack_{frame_idx:02d}.png")
        frame_idx += 1

print("Smooth attack frames processed and placed in Attack right!")
