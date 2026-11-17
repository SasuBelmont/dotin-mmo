import sys, os
import bpy

sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client\blendergranny')
import io_scene_gr2
try:
    io_scene_gr2.register()
except Exception:
    pass

bpy.ops.wm.read_factory_settings(use_empty=True)
p = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted\zone\b\obj\b-general_wbridge01.gr2'
bpy.ops.import_scene.gr2_native(filepath=p, import_animations=False)
print("\n=== b-general_wbridge01.gr2 ===")
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        mats = [m.name if m else 'None' for m in obj.data.materials]
        print(f"  Mesh: {obj.name}, Dimensions: {obj.dimensions}, Mats: {mats}")
