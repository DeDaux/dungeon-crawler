import os
from PIL import Image

src_img = r"C:\Users\bauzy\.gemini\antigravity\brain\90a55268-e8bf-4462-a0be-993ea8abce5a\orc_sprite_sheet_v2_1780167071081.png"
base_dir = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Orc"

img = Image.open(src_img).convert("RGBA")
width, height = img.size
cols, rows = 4, 4
frame_w, frame_h = width // cols, height // rows

clean_frames = {}
frame_idx = 1
for row in range(rows):
    for col in range(cols):
        left, upper = col * frame_w, row * frame_h
        right, lower = left + frame_w, upper + frame_h
        frame = img.crop((left, upper, right, lower))
        
        datas = frame.getdata()
        new_data = []
        for item in datas:
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
        
        clean_frames[f"orc_frame_{frame_idx:02d}.png"] = frame
        frame_idx += 1

folders_to_restore = ["Walk right", "Walk left", "Idle right", "Attack right"]
for folder in folders_to_restore:
    folder_path = os.path.join(base_dir, folder)
    if os.path.exists(folder_path):
        for filename in os.listdir(folder_path):
            if filename in clean_frames:
                clean_frames[filename].save(os.path.join(folder_path, filename), "PNG")
                print(f"Restored {filename} in {folder}")

folders_to_flip = {"Idle right": "Idle left", "Attack right": "Attack left"}
for src_folder, dest_folder in folders_to_flip.items():
    src_path = os.path.join(base_dir, src_folder)
    dest_path = os.path.join(base_dir, dest_folder)
    if os.path.exists(src_path) and os.path.exists(dest_path):
        for filename in os.listdir(src_path):
            s_file = os.path.join(src_path, filename)
            d_file = os.path.join(dest_path, filename)
            if os.path.exists(s_file):
                img_src = Image.open(s_file)
                img_flipped = img_src.transpose(Image.FLIP_LEFT_RIGHT)
                img_flipped.save(d_file, "PNG")
                print(f"Restored {filename} in {dest_folder}")

print("Frames successfully restored from source!")
