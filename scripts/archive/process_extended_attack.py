import os
from PIL import Image

src_img = r"C:\Users\bauzy\.gemini\antigravity\brain\90a55268-e8bf-4462-a0be-993ea8abce5a\orc_attack_frames_1780168438386.png"
base_dir = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Orc"

right_dir = os.path.join(base_dir, "Attack right 16")
left_dir = os.path.join(base_dir, "Attack left 16")
os.makedirs(right_dir, exist_ok=True)
os.makedirs(left_dir, exist_ok=True)

img = Image.open(src_img).convert("RGBA")
width, height = img.size
cols, rows = 4, 4
frame_w, frame_h = width // cols, height // rows

frame_idx = 1
for row in range(rows):
    for col in range(cols):
        left_coord, upper_coord = col * frame_w, row * frame_h
        right_coord, lower_coord = left_coord + frame_w, upper_coord + frame_h
        frame = img.crop((left_coord, upper_coord, right_coord, lower_coord))
        
        # Remove green background
        datas = frame.getdata()
        new_data = []
        for item in datas:
            if item[0] < 50 and item[1] > 200 and item[2] < 50:
                new_data.append((0, 0, 0, 0))
            else:
                new_data.append(item)
        frame.putdata(new_data)
        
        # Center horizontally to prevent jitter
        bbox = frame.getbbox()
        if bbox:
            center_x = (bbox[0] + bbox[2]) // 2
            offset_x = (frame_w // 2) - center_x
            new_img = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
            new_img.paste(frame, (offset_x, 0))
            frame = new_img
        
        right_path = os.path.join(right_dir, f"orc_attack_{frame_idx:02d}.png")
        frame.save(right_path, "PNG")
        
        left_path = os.path.join(left_dir, f"orc_attack_{frame_idx:02d}.png")
        img_flipped = frame.transpose(Image.FLIP_LEFT_RIGHT)
        img_flipped.save(left_path, "PNG")
        
        frame_idx += 1

print("Extended attack frames processed!")
