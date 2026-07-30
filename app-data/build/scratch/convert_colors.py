import re
import sys

def rgba_to_hex(match):
    r, g, b, a = match.groups()
    r, g, b = int(r), int(g), int(b)
    a = float(a)
    a_int = int(round(a * 255))
    return f"#{r:02x}{g:02x}{b:02x}{a_int:02x}"

def rgb_to_hex(match):
    r, g, b = match.groups()
    r, g, b = int(r), int(g), int(b)
    return f"#{r:02x}{g:02x}{b:02x}"

if __name__ == "__main__":
    with open("misdreavus-card.html", "r") as f:
        content = f.read()

    # Replace rgba
    content = re.sub(r'rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)', rgba_to_hex, content)
    # Replace rgb
    content = re.sub(r'rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)', rgb_to_hex, content)

    # Optional: replace transparent with #00000000
    content = re.sub(r'\btransparent\b', '#00000000', content)

    with open("misdreavus-card.html", "w") as f:
        f.write(content)
