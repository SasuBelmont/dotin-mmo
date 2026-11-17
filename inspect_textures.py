import json

for fname in ['ninja_male_1.glb', 'shaman_male_1.glb']:
    path = f'C:\\Users\\JP\\Desktop\\Dotin\\client\\public\\assets\\models\\{fname}'
    with open(path, 'rb') as f:
        f.seek(12)
        chunk_len = int.from_bytes(f.read(4), 'little')
        f.read(4)
        gltf = json.loads(f.read(chunk_len))
    print(f"\n=== {fname} ===")
    for i, img in enumerate(gltf.get('images', [])):
        print(f"  Image {i}: name='{img.get('name')}', mimeType={img.get('mimeType')}")
    for i, tex in enumerate(gltf.get('textures', [])):
        print(f"  Texture {i}: source={tex.get('source')}")
