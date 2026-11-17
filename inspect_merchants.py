import json

for fname in ['general_store.glb', 'bank.glb']:
    path = rf'C:\Users\JP\Desktop\Dotin\client\public\assets\models\{fname}'
    with open(path, 'rb') as f:
        f.seek(12)
        chunk_len, chunk_type = int.from_bytes(f.read(4), 'little'), f.read(4)
        gltf = json.loads(f.read(chunk_len))
    print(f"\n=== {fname} ===")
    for i, n in enumerate(gltf.get('nodes', [])):
        if n.get('mesh') is not None:
            print(f"  Node {i}: name={n.get('name')}, mesh={n.get('mesh')}, skin={n.get('skin')}")
