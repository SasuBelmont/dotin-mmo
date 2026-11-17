import json

glbs = ['blacksmith.glb', 'guard_leader.glb', 'market_board.glb', 'furnace_brazier.glb']
base = r'C:\Users\JP\Desktop\Dotin\client\public\assets\models'

for fname in glbs:
    path = f'{base}\\{fname}'
    with open(path, 'rb') as f:
        f.seek(12)
        chunk_len = int.from_bytes(f.read(4), 'little')
        f.read(4)
        gltf = json.loads(f.read(chunk_len))
    
    mesh_nodes = [n for n in gltf.get('nodes', []) if n.get('mesh') is not None]
    anim_count = len(gltf.get('animations', []))
    skin_count = len(gltf.get('skins', []))
    
    print(f"\n=== {fname} ===")
    print(f"  Meshes: {len(gltf.get('meshes', []))}, Skins: {skin_count}, Animations: {anim_count}")
    for n in mesh_nodes:
        print(f"  Node '{n.get('name')}': mesh={n.get('mesh')}, skin={n.get('skin')}")
