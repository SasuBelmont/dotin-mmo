import sys, os
sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client')
from mt2_unpacker import Metin2Pack

def inspect_pack(path):
    pack = Metin2Pack(path)
    subdirs = set()
    for entry in pack.index_entries:
        parts = entry['filename'].lower().split('/')
        # Look for npc/something
        for i, p in enumerate(parts):
            if p == 'npc' and i + 1 < len(parts):
                subdirs.add(parts[i+1])
    return sorted(subdirs)

print("NPC.eix NPCs:", inspect_pack(r'C:\Users\JP\Desktop\Dotin\MT2Client\all_eix\NPC.eix'))
print("npc2.eix NPCs:", inspect_pack(r'C:\Users\JP\Desktop\Dotin\MT2Client\all_eix\npc2.eix'))
