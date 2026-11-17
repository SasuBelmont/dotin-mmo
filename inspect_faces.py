import json

models = ['ninja_male_1.glb', 'ninja_male_2.glb', 'shaman_male_1.glb', 'shaman_male_2.glb']
base = r'C:\Users\JP\Desktop\Dotin\client\public\assets\models'

for fname in models:
    path = f'{base}\\{fname}'
    with open(path, 'rb') as f:
        f.seek(12)
        chunk_len = int.from_bytes(f.read(4), 'little')
        f.read(4)
        gltf = json.loads(f.read(chunk_len))
    
    print(f"\n================== {fname} ==================")
    print("Meshes:")
    for i, m in enumerate(gltf.get('meshes', [])):
        prims = m.get('primitives', [])
        mat_indices = [p.get('material') for p in prims]
        print(f"  Mesh {i}: name='{m.get('name')}', mats={mat_indices}")
    
    print("Materials:")
    for i, mat in enumerate(gltf.get('materials', [])):
        pbr = mat.get('pbrMetallicRoughness', {})
        bcol = pbr.get('baseColorTexture')
        alpha = mat.get('alphaMode', 'OPAQUE')
        print(f"  Mat {i}: name='{mat.get('name')}', alphaMode={alpha}, alphaCutoff={mat.get('alphaCutoff')}, bcol={bcol}")

    print("Nodes:")
    for i, n in enumerate(gltf.get('nodes', [])):
        if n.get('mesh') is not None:
            print(f"  Node {i}: name='{n.get('name')}', mesh={n.get('mesh')}")
