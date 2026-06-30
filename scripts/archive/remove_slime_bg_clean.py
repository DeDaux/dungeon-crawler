import os
try:
    from PIL import Image
except Exception:
    raise ImportError("Pillow is required. Install it with: pip install pillow")

BASE = r"C:\Users\bauzy\.gemini\antigravity\scratch\Sprites\Slime"

# Walk all subdirs
for root, dirs, files in os.walk(BASE):
    for f in files:
        if not f.lower().endswith('.png'):
            continue
        in_path = os.path.join(root, f)
        try:
            img = Image.open(in_path).convert("RGBA")
            datas = img.getdata()
            new_data = []
            for item in datas:
                r, g, b, a = item
                # Green screen key: strong green with tolerance
                if g > 180 and g > r * 1.4 and g > b * 1.4:
                    new_data.append((0, 0, 0, 0))
                else:
                    new_data.append(item)
            img.putdata(new_data)
            img.save(in_path, "PNG")
            print(f"OK: {in_path}")
        except Exception as e:
            print(f"FAIL: {in_path}: {e}")

print("Done removing Slime backgrounds.")