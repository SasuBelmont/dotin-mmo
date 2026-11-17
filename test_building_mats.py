import sys, os
import bpy

sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client\blendergranny')
import io_scene_gr2
try:
    io_scene_gr2.register()
except Exception:
    pass

bld_dir = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted\zone\b\building'
for f in ['b1-010-bank.gr2', 'b1-007-itemshop.gr2', 'b1-008-house5.gr2', 'b1-011-workhouse.gr2', 'b1-001-house3.gr2']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    p = os.path.join(bld_dir, f)
    if os.path.exists(p):
        bpy.ops.import_scene.gr2_native(filepath=p, import_animations=False)
        print(f"\n=== {f} ===")
        for obj in bpy.data.objects:
            if obj.type == 'MESH':
                mats = [m.name if m else 'None' for m in obj.data.materials]
                print(f"  Mesh: {obj.name}, Mats: {mats}")
