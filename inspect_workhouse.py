import sys, os
import bpy

sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client\blendergranny')
import io_scene_gr2
try:
    io_scene_gr2.register()
except Exception:
    pass

bpy.ops.wm.read_factory_settings(use_empty=True)
gr2_path = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted\zone\b\building\b1-011-workhouse.gr2'
bpy.ops.import_scene.gr2_native(filepath=gr2_path, import_animations=False)

print("\n--- WORKHOUSE OBJECTS ---")
for obj in bpy.data.objects:
    print(f"Object: {obj.name}, Type: {obj.type}, Dimensions: {obj.dimensions}")
    if obj.type == 'MESH':
        print(f"  Materials: {[m.name for m in obj.data.materials]}")
