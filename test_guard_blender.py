import sys, os
import bpy

sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client\blendergranny')
import io_scene_gr2
try:
    io_scene_gr2.register()
except Exception:
    pass

bpy.ops.wm.read_factory_settings(use_empty=True)
gr2_path = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted\npc\guard_leader\guard_leader.gr2'
anim_path = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted\npc\guard_leader\wait.gr2'
bpy.ops.import_scene.gr2_native(filepath=gr2_path, import_animations=True, animation_filepath=anim_path)

print("\n--- GUARD LEADER ---")
for obj in bpy.data.objects:
    print(f"Obj: {obj.name}, Type: {obj.type}, Dimensions: {obj.dimensions}")
    if obj.type == 'MESH':
        print(f"  Materials: {[m.name for m in obj.data.materials]}")
        print(f"  Modifiers: {[m.name + ' (' + m.type + ')' for m in obj.modifiers]}")
