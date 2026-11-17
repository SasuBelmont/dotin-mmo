import json

with open(r'C:\Users\JP\Desktop\Dotin\client\public\assets\models\blacksmith.glb', 'rb') as f:
    f.seek(12)
    chunk_len, chunk_type = int.from_bytes(f.read(4), 'little'), f.read(4)
    gltf = json.loads(f.read(chunk_len))

print("=== NODES ===")
for i, n in enumerate(gltf.get('nodes', [])):
    print(f"{i}: name={n.get('name')}, mesh={n.get('mesh')}, skin={n.get('skin')}, children={n.get('children')}, trans={n.get('translation')}")

print("\n=== MESHES ===")
for i, m in enumerate(gltf.get('meshes', [])):
    print(f"{i}: name={m.get('name')}")

print("\n=== SCENES ===")
for i, s in enumerate(gltf.get('scenes', [])):
    print(f"{i}: name={s.get('name')}, nodes={s.get('nodes')}")

print("\n=== SKINS ===")
for i, s in enumerate(gltf.get('skins', [])):
    print(f"{i}: name={s.get('name')}, joints={s.get('joints')}")
