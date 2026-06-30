# process_all_sprites.py — Split sprite sheets and organize frames for Phase 2
# Run: python process_all_sprites.py

import os
import sys

try:
    from PIL import Image, ImageOps
except ImportError:
    print("Pillow is required. Install with: pip install Pillow")
    sys.exit(1)

BASE = os.path.dirname(os.path.abspath(__file__))

def ensure_dir(path):
    os.makedirs(path, exist_ok=True)

def remove_green_bg(frame):
    """Remove green/cyan background from a frame."""
    data = frame.getdata()
    new_data = []
    for item in data:
        r, g, b, a = item[:4] if len(item) == 4 else (item[0], item[1], item[2], 255)
        # Green-ish pixels become transparent
        if g > r + 20 and g > b + 20 and g > 30:
            new_data.append((0, 0, 0, 0))
        else:
            new_data.append(item if len(item) == 4 else (r, g, b, 255))
    frame.putdata(new_data)
    return frame

def remove_cyan_bg(data_threshold=30):
    """Factory: returns a function that removes cyan-ish backgrounds."""
    def cleaner(frame):
        data = frame.getdata()
        new_data = []
        for item in data:
            r, g, b, a = item[:4] if len(item) == 4 else (item[0], item[1], item[2], 255)
            if g > r + 20 and b > r + 20 and g > data_threshold and b > data_threshold:
                new_data.append((0, 0, 0, 0))
            else:
                new_data.append(item if len(item) == 4 else (r, g, b, 255))
        frame.putdata(new_data)
        return frame
    return cleaner

# ==================== 1. PYROMANCER (girl) ====================
# fantasy_girl_sprite_microkini.png — single row, 4 columns
def process_girl():
    print("=== Processing Pyromancer (girl) ===")
    src = os.path.join(BASE, "girl", "fantasy_girl_sprite_microkini.png")
    if not os.path.exists(src):
        print("  SKIP: file not found")
        return
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    cols = 4
    fw, fh = w // cols, h
    out = os.path.join(BASE, "girl", "Idle right")
    ensure_dir(out)
    cleaner = remove_cyan_bg(20)
    for i in range(cols):
        frame = img.crop((i * fw, 0, (i + 1) * fw, fh)).copy()
        frame = cleaner(frame)
        frame.save(os.path.join(out, f"frame_{i}.png"))
    print(f"  Saved {cols} frames to {out}")

    # Mirror for left
    out_left = os.path.join(BASE, "girl", "Idle left")
    ensure_dir(out_left)
    for i in range(cols):
        frame = img.crop((i * fw, 0, (i + 1) * fw, fh)).copy()
        frame = ImageOps.mirror(frame)
        frame = cleaner(frame)
        frame.save(os.path.join(out_left, f"frame_{i}.png"))
    print(f"  Saved {cols} frames to {out_left}")


# ==================== 2. SLIME ====================
# download.png — single small image, use as-is for all states
def process_slime():
    print("=== Processing Slime ===")
    src = os.path.join(BASE, "Slime", "download.png")
    if not os.path.exists(src):
        print("  SKIP: file not found")
        return
    img = Image.open(src).convert("RGBA")
    # Resize to standard enemy size (~32x32)
    img = img.resize((32, 32), Image.NEAREST)

    # Same frame for all states — slime barely animates
    for state in ["Idle right", "Walk right", "Attack right"]:
        out = os.path.join(BASE, "Slime", state)
        ensure_dir(out)
        img.save(os.path.join(out, "frame_0.png"))
        print(f"  Saved to {out}")


# ==================== 3. GOBLET KNIGHT → PALADIN ====================
# goblet knight.png — single row spritesheet, figure out cols from image
def process_paladin():
    print("=== Processing Paladin (goblet knight) ===")
    src = os.path.join(BASE, "goblet knight", "goblet knight.png")
    if not os.path.exists(src):
        print("  SKIP: file not found")
        return
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    cols = w // h  # assume square frames in one row
    if cols < 2:
        cols = 4  # fallback
    fw, fh = w // cols, h

    print(f"  Sheet: {w}x{h}, {cols} frames at {fw}x{fh}")
    cleaner = remove_cyan_bg(20)

    for state, row_offset in [("Idle right", 0), ("Walk right", 0), ("Attack right", 0)]:
        out = os.path.join(BASE, "Paladin 1", state)
        ensure_dir(out)
        for i in range(cols):
            frame = img.crop((i * fw, 0, (i + 1) * fw, fh)).copy()
            frame = cleaner(frame)
            frame.save(os.path.join(out, f"frame_{i}.png"))
        print(f"  Saved {cols} frames to {out}")

    # Mirror for left
    for state, row_offset in [("Idle left", 0), ("Walk left", 0), ("Attack left", 0)]:
        out = os.path.join(BASE, "Paladin 1", state)
        ensure_dir(out)
        for i in range(cols):
            frame = img.crop((i * fw, 0, (i + 1) * fw, fh)).copy()
            frame = ImageOps.mirror(frame)
            frame = cleaner(frame)
            frame.save(os.path.join(out, f"frame_{i}.png"))
        print(f"  Saved {cols} mirrored frames to {out}")


# ==================== 4. CANDLEMAN → ENEMY (WICKED UNDEAD) ====================
def process_candleman():
    print("=== Processing Candleman ===")
    src = os.path.join(BASE, "candleman", "download.png")
    if not os.path.exists(src):
        print("  SKIP: file not found")
        return
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    cols = w // (h // 2) if h > 0 else 4  # guess: 2 rows, square frames
    # Try to detect grid: common patterns are 4x2, 4x4
    fh = h // 2 if h > 0 else h
    fw = fh
    cols = min(w // fw, 8)

    print(f"  Sheet: {w}x{h}, estimating {cols}x2 frames at {fw}x{fh}")
    cleaner = remove_cyan_bg(30)
    # We'll just use it as a single still for now
    out_idle = os.path.join(BASE, "candleman", "Idle right")
    ensure_dir(out_idle)
    frame = img.crop((0, 0, fw, fh)).copy()
    frame = cleaner(frame)
    frame.save(os.path.join(out_idle, "frame_0.png"))
    print(f"  Saved 1 frame to {out_idle}")


# ==================== 5. DEMONESS IDLE FRAMES (re-enumerate) ====================
def organize_demoness():
    """Demoness already has split frames but naming varies between demoness_frame_XX.png and numbered."""
    print("=== Organizing Demoness frames ===")
    base = os.path.join(BASE, "Demoness")
    groups = {
        "Idle right": ("demoness_frame_09", "demoness_frame_10", "demoness_frame_11", "demoness_frame_12"),
        "Idle left": ("demoness_frame_09", "demoness_frame_10", "demoness_frame_11", "demoness_frame_12"),
        "Walk right": ("demoness_frame_01", "demoness_frame_02", "demoness_frame_03", "demoness_frame_04"),
        "Walk left": ("demoness_frame_01", "demoness_frame_02", "demoness_frame_03", "demoness_frame_04"),
        "Attack right": ("demoness_frame_13", "demoness_frame_14", "demoness_frame_15", "demoness_frame_16"),
        "Attack left": ("demoness_frame_13", "demoness_frame_14", "demoness_frame_15", "demoness_frame_16"),
    }
    for state, names in groups.items():
        folder = os.path.join(base, state)
        if not os.path.exists(folder):
            print(f"  SKIP: {folder} not found")
            continue
        files = sorted(os.listdir(folder))
        # Re-number to frame_0..N.png
        for i, f in enumerate(files):
            old = os.path.join(folder, f)
            new = os.path.join(folder, f"frame_{i}.png")
            if old != new:
                os.rename(old, new)
        print(f"  Renamed {len(files)} frames in {state}")
    print("  Done")


# ==================== 6. ORC IDLE FRAMES (re-enumerate) ====================
def organize_orc():
    """Orc has mixed naming: walk/attack use 1-4.png, idle uses orc_frame_XX.png"""
    print("=== Organizing Orc frames ===")
    base = os.path.join(BASE, "Orc")
    states = ["Idle right", "Idle left", "Walk right", "Walk left", "Attack right", "Attack left"]
    for state in states:
        folder = os.path.join(base, state)
        if not os.path.exists(folder):
            print(f"  SKIP: {folder} not found")
            continue
        files = sorted(os.listdir(folder))
        # Re-number to frame_0..N.png
        for i, f in enumerate(files):
            old = os.path.join(folder, f)
            new = os.path.join(folder, f"frame_{i}.png")
            if old != new:
                os.rename(old, new)
        print(f"  Renamed {len(files)} frames in {state}")
    print("  Done")


# ==================== 7. GOBLIN (re-enumerate) ====================
def organize_goblin():
    """Goblin uses goblin_frame_XX naming."""
    print("=== Organizing Goblin frames ===")
    base = os.path.join(BASE, "Goblin")
    states = ["Idle right", "Idle left", "Walk right", "Walk left", "Attack right", "Attack left"]
    for state in states:
        folder = os.path.join(base, state)
        if not os.path.exists(folder):
            print(f"  SKIP: {folder} not found")
            continue
        files = sorted(os.listdir(folder))
        for i, f in enumerate(files):
            old = os.path.join(folder, f)
            new = os.path.join(folder, f"frame_{i}.png")
            if old != new:
                os.rename(old, new)
        print(f"  Renamed {len(files)} frames in {state}")
    print("  Done")


# ==================== 8. NEWCHAR (organize) ====================
def organize_newchar():
    """NewChar has both split frames and sheets. Ensure Attack has 4 consistent frames."""
    print("=== Organizing NewChar frames ===")
    base = os.path.join(BASE, "NewChar")
    # Walking states: frame_0-3.png
    walk_states = ["Walking right", "Walking up", "Walking down", "Walking left"]
    for state in walk_states:
        folder = os.path.join(base, state)
        if not os.path.exists(folder):
            print(f"  SKIP: {folder} not found")
            continue
        files = sorted(os.listdir(folder))
        for i, f in enumerate(files):
            old = os.path.join(folder, f)
            new = os.path.join(folder, f"frame_{i}.png")
            if old != new:
                os.rename(old, new)
        print(f"  Renamed {len(files)} frames in {state}")
    # Attack states: 1-4.png (or anim_frame_0-3.png)
    attack_states = ["Attack down", "Attack left", "Attack right", "Attack up"]
    for state in attack_states:
        folder = os.path.join(base, state)
        if not os.path.exists(folder):
            print(f"  SKIP: {folder} not found")
            continue
        files = sorted(os.listdir(folder))
        for i, f in enumerate(files):
            old = os.path.join(folder, f)
            new = os.path.join(folder, f"frame_{i}.png")
            if old != new:
                os.rename(old, new)
        print(f"  Renamed {len(files)} frames in {state}")
    print("  Done")


if __name__ == "__main__":
    process_girl()
    process_slime()
    process_paladin()
    process_candleman()
    organize_demoness()
    organize_orc()
    organize_goblin()
    organize_newchar()
    print("\nAll done!")
