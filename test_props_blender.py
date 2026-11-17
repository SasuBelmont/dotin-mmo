import sys, os
import bpy

sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client\blendergranny')
import io_scene_gr2
try:
    io_scene_gr2.register()
except Exception:
    pass

# Test market board
bpy.ops.wm.read_factory_settings(use_empty=True)
board_gr2 = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted\zone\b\obj\ob-standganpan-01.gr2'
bpy.ops.import_scene.gr2_native(filepath=board_gr2, import_animations=False)
print("\n--- STANDGANPAN ---")
for obj in bpy.data.objects:
    print(f"Obj: {obj.name}, Type: {obj.type}, Dimensions: {obj.dimensions}")
    if obj.type == 'MESH':
        print(f"  Materials: {[m.name for m in obj.data.materials]}")

# Test brazier
bpy.ops.wm.read_factory_settings(use_empty=True)
brazier_gr2 = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted\zone\b\obj\ob_brazier.gr2'
bpy.ops.import_scene.gr2_native(filepath=brazier_gr2, import_animations=False)
print("\n--- BRAZIER ---")
for obj in bpy.data.objects:
    print(f"Obj: {obj.name}, Type: {obj.type}, Dimensions: {obj.dimensions}")
    if obj.type == 'MESH':
        print(f"  Materials: {[m.name for m in obj.data.materials]}")
