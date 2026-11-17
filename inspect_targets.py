import sys, os
sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client')
from mt2_unpacker import Metin2Pack

pack = Metin2Pack(r'C:\Users\JP\Desktop\Dotin\MT2Client\all_eix\NPC.eix')
targets = ['guard_leader', 'arms', 'defence', 'doctor']
for target in targets:
    print(f"\nFiles for {target}:")
    for entry in pack.index_entries:
        if f'/{target}/' in entry['filename'].lower():
            print(" ", entry['filename'])
