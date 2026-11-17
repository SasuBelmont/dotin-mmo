import sys, os

sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client\blendergranny')
import pygranny

obj_dir = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted\zone\b\obj'
files = ['general_obj_boat01.gr2', 'general_obj_campfire.gr2', 'ob-b1-005-woodbarrel.gr2', 'general_obj_woodbox.gr2']

for f in files:
    p = os.path.join(obj_dir, f)
    gr2 = pygranny.load_sections(pygranny.read_gr2(p))
    print(f"\n=== {f} ===")
    if hasattr(gr2, 'Materials') and gr2.Materials:
        for m in gr2.Materials:
            print(f"Material: {m.Name}")
            if hasattr(m, 'Maps') and m.Maps:
                for mp in m.Maps:
                    print(f"  Map: {getattr(mp, 'Usage', 'unknown')}, {getattr(mp, 'Map', 'no map')}")
            # check texture pointers
            if hasattr(m, 'Texture'):
                print(f"  Texture: {m.Texture}")
    if hasattr(gr2, 'Textures') and gr2.Textures:
        for t in gr2.Textures:
            print(f"Texture: {getattr(t, 'FileName', getattr(t, 'Name', 'unnamed'))}")
