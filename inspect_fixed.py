import json

with open(r'C:\Users\JP\Desktop\Dotin\MT2Client\blacksmith_fixed.glb', 'rb') as f:
    f.seek(12)
    chunk_len, chunk_type = int.from_bytes(f.read(4), 'little'), f.read(4)
    gltf = json.loads(f.read(chunk_len))

print("Nodes with meshes:")
for i, n in enumerate(gltf.get('nodes', [])):
    if n.get('mesh') is not None:
        print(f"  Node {i}: name={n.get('name')}, mesh={n.get('mesh')}, skin={n.get('skin')}")

print("\nSkins:")
for i, s in enumerate(gltf.get('skins', [])):
    print(f"  Skin {i}: joints count={len(s.get('joints'))}")
