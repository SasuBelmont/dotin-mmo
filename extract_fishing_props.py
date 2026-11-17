import sys, os

sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client')
from mt2_unpacker import Metin2Pack

pack = Metin2Pack(r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted_packs\Client\pack\Zone.eix')
extracted_dir = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted'

targets = [
    r'zone/b/obj/general_obj_boat01.*',
    r'zone/b/obj/general_obj_boat02.*',
    r'zone/b/obj/general_obj_campfire.*',
    r'zone/b/obj/general_obj_ferryboat.*',
    r'zone/b/obj/ob-b1-005-woodbarrel.*',
    r'zone/b/obj/general_obj_woodbox.*',
    r'zone/b/obj/b-general_wbridge01.*',
    r'zone/b/obj/b-general_wbridge02.*'
]

for pat in targets:
    print(f"Extracting {pat}...")
    pack.extract_files(pat, extracted_dir)

print("Extraction complete!")
