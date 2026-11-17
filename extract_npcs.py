import sys, os
sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client')
from mt2_unpacker import Metin2Pack

pack_path = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted_packs\Client\pack\NPC.eix'
extracted_dir = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted'

pack = Metin2Pack(pack_path)
regex = r'npc/(guard_leader|arms|defence|doctor|alchemist)/'
print("Extracting NPCs from pack...")
pack.extract_files(regex, extracted_dir)
print("Done extracting NPCs!")
