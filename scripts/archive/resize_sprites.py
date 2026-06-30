import os
from PIL import Image

def resize_images(root_dir, max_size=64):
    for subdir, _, files in os.walk(root_dir):
        # Skip the src directory to avoid touching non-sprite assets if any
        if "src" in subdir:
            continue
        for file in files:
            if file.lower().endswith(".png"):
                path = os.path.join(subdir, file)
                try:
                    with Image.open(path) as img:
                        if img.width > max_size or img.height > max_size:
                            # Use LANCZOS for high-quality downsampling
                            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                            img.save(path)
                            print(f"Resized: {path}")
                except Exception as e:
                    print(f"Error processing {path}: {e}")

if __name__ == "__main__":
    resize_images(".")
