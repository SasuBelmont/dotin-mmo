import sys, os
sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client')
from mt2_unpacker import Metin2Pack

pack_path = r'C:\Users\JP\Desktop\Dotin\MT2Client\data\pc2.eix'
pack = Metin2Pack(pack_path)
for entry in pack.index_entries:
    fn = entry['filename'].lower()
    if fn.endswith('.msm'):
        print(entry['filename'])
