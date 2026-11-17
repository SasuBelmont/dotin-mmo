import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

# Dock dimensions: 6.4m wide x 13.5m long (aspect ratio ~ 1 : 2.11)
width = 1024
height = 2160

# Base Metin2 wood plank palette from actual MT2 textures
wood_base_colors = [
    (142, 108, 68),
    (124, 92, 56),
    (155, 120, 78),
    (132, 98, 62),
    (112, 82, 50),
    (148, 114, 72),
    (128, 96, 58),
    (118, 86, 52),
    (138, 104, 66),
    (162, 126, 82),
]

img = Image.new('RGBA', (width, height), (124, 92, 56, 255))
draw = ImageDraw.Draw(img)

# Side beam width (structural outer beams of the pier)
beam_w = 44

# Load genuine Metin2 wood grain from ferryboat texture
mt2_boat = Image.open('C:/Users/JP/.gemini/antigravity/brain/673bb14a-173e-4fad-8db3-c117755aeaf4/general_obj_ferryboat.png').convert('RGBA')
# Crop the upper-left pure wood planks region: (2, 2, 58, 138)
mt2_grain_crop = mt2_boat.crop((2, 2, 58, 138)).resize((width, height), Image.Resampling.BICUBIC)
mt2_grain_arr = np.array(mt2_grain_crop, dtype=np.float32)[:, :, :3]

np.random.seed(1337)
y = 0
plank_idx = 0

while y < height:
    plank_h = np.random.randint(34, 46)
    if y + plank_h > height:
        plank_h = height - y
    
    # Pick a wood tone with organic variation
    base_col = wood_base_colors[plank_idx % len(wood_base_colors)]
    var = np.random.randint(-14, 14)
    col = tuple(max(0, min(255, c + var)) for c in base_col)
    
    # Draw plank background between side beams
    draw.rectangle([beam_w, y, width - beam_w, y + plank_h], fill=col)
    
    # Realistic fine wood grain lines across the width
    num_grains = np.random.randint(18, 30)
    for _ in range(num_grains):
        gy = y + np.random.randint(2, plank_h - 2)
        g_bright = np.random.randint(-22, 22)
        g_col = tuple(max(0, min(255, c + g_bright)) for c in col)
        g_len = np.random.randint(150, width - 2 * beam_w)
        gx = np.random.randint(beam_w, width - beam_w - g_len + 1)
        draw.line([gx, gy, gx + g_len, gy], fill=g_col, width=1)

    # Highlight top edge of plank (light catching the edge)
    hl_col = tuple(max(0, min(255, c + 30)) for c in col)
    draw.line([beam_w, y, width - beam_w, y], fill=hl_col, width=1)
    
    # Shadow/gap at bottom of plank
    sh_col = (25, 16, 10, 255)
    draw.line([beam_w, y + plank_h - 1, width - beam_w, y + plank_h - 1], fill=sh_col, width=2)
    
    # Iron nails near beam edges
    nail_col = (35, 30, 26, 255)
    nail_hl = (150, 140, 130, 255)
    for nx in [beam_w + 12, width - beam_w - 12]:
        ny = y + plank_h // 2
        draw.ellipse([nx - 3, ny - 3, nx + 3, ny + 3], fill=nail_col)
        draw.point((nx - 1, ny - 1), fill=nail_hl)
    
    y += plank_h
    plank_idx += 1

# Draw longitudinal outer side beams (long beams running along the dock)
for side in [0, 1]:
    bx0 = 0 if side == 0 else width - beam_w
    bx1 = beam_w if side == 0 else width
    beam_col = (88, 62, 38, 255)
    draw.rectangle([bx0, 0, bx1, height], fill=beam_col)
    
    # Vertical wood grain on side beams
    for _ in range(120):
        vx = np.random.randint(bx0 + 2, bx1 - 2)
        vy0 = np.random.randint(0, height - 300)
        vy1 = vy0 + np.random.randint(100, 500)
        g_bright = np.random.randint(-18, 18)
        vg_col = tuple(max(0, min(255, c + g_bright)) for c in beam_col[:3])
        draw.line([vx, vy0, vx, vy1], fill=vg_col, width=1)
        
    # Inner border line of side beam
    inner_x = beam_w - 1 if side == 0 else width - beam_w
    draw.line([inner_x, 0, inner_x, height], fill=(25, 16, 10, 255), width=2)

# End cap beam over the ocean (bottom edge)
end_beam_h = 42
draw.rectangle([0, height - end_beam_h, width, height], fill=(78, 54, 34, 255))
draw.line([0, height - end_beam_h, width, height - end_beam_h], fill=(25, 16, 10, 255), width=2)
draw.line([0, height - end_beam_h + 1, width, height - end_beam_h + 1], fill=(130, 95, 60, 255), width=1)

# Blend 35% authentic Metin2 ferryboat weathered wood texture
base_arr = np.array(img, dtype=np.float32)
blended_rgb = base_arr[:, :, :3] * 0.65 + mt2_grain_arr * 0.35

# Subtle organic noise
noise = np.random.normal(0, 5, (height, width, 3))
final_rgb = np.clip(blended_rgb + noise, 0, 255).astype(np.uint8)

final_img = Image.fromarray(final_rgb, mode='RGB')

out_path = 'C:/Users/JP/Desktop/Dotin/client/public/assets/textures/mt2_dock_continuous.png'
final_img.save(out_path, format='PNG')

out_dist = 'C:/Users/JP/Desktop/Dotin/client/dist/assets/textures/mt2_dock_continuous.png'
final_img.save(out_dist, format='PNG')

out_artifact = 'C:/Users/JP/.gemini/antigravity/brain/673bb14a-173e-4fad-8db3-c117755aeaf4/mt2_dock_continuous.png'
final_img.save(out_artifact, format='PNG')

print('AUTHENTIC BLENDED CONTINUOUS DOCK TEXTURE GENERATED!')
