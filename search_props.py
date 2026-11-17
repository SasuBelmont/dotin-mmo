import sys, os
sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client')
from mt2_unpacker import Metin2Pack

def search_pack(path, keywords):
    pack = Metin2Pack(path)
    print(f"\n--- Searching {os.path.basename(path)} ---")
    for entry in pack.index_entries:
        fname = entry['filename'].lower()
        if any(k in fname for k in keywords):
            print(" ", entry['filename'])

search_pack(r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted_packs\Client\pack\NPC.eix', ['board', 'sign', 'post', 'stone', 'flag', 'door'])
search_pack(r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted_packs\Client\pack\Zone.eix', ['board', 'sign', 'ganpan', 'furnace', 'workhouse', 'brazier'])
