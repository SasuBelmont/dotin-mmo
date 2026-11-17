import sys, os
sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client')
from mt2_unpacker import Metin2Pack

pack_path = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted_packs\Client\pack\Zone.eix'
extracted_dir = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted'

pack = Metin2Pack(pack_path)
regex = r'zone/b/obj/.*(standganpan|brazier|sign)'
print("Extracting props from Zone.eix...")
pack.extract_files(regex, extracted_dir)
print("Done extracting props!")
