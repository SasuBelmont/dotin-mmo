import json

with open(r'C:\Users\JP\Desktop\Dotin\client\public\assets\models\ninja_male_1.glb', 'rb') as f:
    f.seek(12)
    chunk_len = int.from_bytes(f.read(4), 'little')
    f.read(4)
    gltf = json.loads(f.read(chunk_len))

print("Materials in ninja_male_1:")
for m in gltf.get('materials', []):
    print(m)

print("\nMeshes in ninja_male_1:")
for m in gltf.get('meshes', []):
    print(m.get('name'), m.get('primitives'))
