import sys, os
sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client')
from mt2_unpacker import Metin2Pack

pack_path = r'C:\Users\JP\Desktop\Dotin\MT2Client\data\pc2.eix'
extracted_dir = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted'

pack = Metin2Pack(pack_path)
pack.extract_files(r'pc2/(assassin|shaman|sura|warrior)/.*face', extracted_dir)
print("Extracted pc2 faces successfully!")
