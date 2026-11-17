import json
import glob
import os

models_dir = r'C:\Users\JP\Desktop\Dotin\client\public\assets\models'
for fpath in glob.glob(os.path.join(models_dir, '*.glb')):
    fname = os.path.basename(fpath)
    if not any(k in fname for k in ['warrior', 'ninja', 'sura', 'shaman', 'wild_dog', 'wolf', 'dummy']):
        continue
    with open(fpath, 'rb') as f:
        f.seek(12)
        chunk_len = int.from_bytes(f.read(4), 'little')
        f.read(4)
        gltf = json.loads(f.read(chunk_len))
    anims = [a.get('name') for a in gltf.get('animations', [])]
    print(f"{fname}: {anims}")
