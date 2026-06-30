import os
import shutil
from PIL import Image

src_img = r"C:\Users\bauzy\.gemini\antigravity\brain\90a55268-e8bf-4462-a0be-993ea8abce5a\demoness_sprite_sheet_1780167629839.png"
out_dir = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Demoness\Frames"

os.makedirs(out_dir, exist_ok=True)
shutil.copy(src_img, r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Demoness\demoness_sprite_sheet.png")

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
        
        # Remove background (tolerance for #00FF00)
        datas = frame.getdata()
        new_data = []
        for item in datas:
            if item[0] < 50 and item[1] > 200 and item[2] < 50:
                new_data.append((0, 0, 0, 0))
            else:
                new_data.append(item)
        frame.putdata(new_data)
        
        # Center horizontally
        bbox = frame.getbbox()
        if bbox:
            center_x = (bbox[0] + bbox[2]) // 2
            offset_x = (frame_w // 2) - center_x
            new_img = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
            new_img.paste(frame, (offset_x, 0))
            frame = new_img
        
        frame_path = os.path.join(out_dir, f"demoness_frame_{frame_idx:02d}.png")
        frame.save(frame_path, "PNG")
        frame_idx += 1

print("Demoness frames processed successfully!")
