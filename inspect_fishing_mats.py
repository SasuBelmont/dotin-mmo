import sys, os
import bpy

sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client\blendergranny')
import io_scene_gr2
try:
    io_scene_gr2.register()
except Exception:
    pass

obj_dir = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted\zone\b\obj'
files = ['general_obj_boat01.gr2', 'general_obj_campfire.gr2', 'ob-b1-005-woodbarrel.gr2', 'general_obj_woodbox.gr2']

for f in files:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    p = os.path.join(obj_dir, f)
    bpy.ops.import_scene.gr2_native(filepath=p, import_animations=False)
    print(f"\n=== {f} ===")
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            mats = [m.name if m else 'None' for m in obj.data.materials]
            print(f"  Mesh: {obj.name}, Dimensions: {obj.dimensions}, Mats: {mats}")
