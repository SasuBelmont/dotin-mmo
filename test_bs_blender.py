import sys, os
import bpy

sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client\blendergranny')
import io_scene_gr2
try:
    io_scene_gr2.register()
except Exception:
    pass

bpy.ops.wm.read_factory_settings(use_empty=True)
gr2_path = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted\npc\blacksmith\blacksmith.gr2'
anim_path = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted\npc\blacksmith\wait.gr2'

bpy.ops.import_scene.gr2_native(filepath=gr2_path, import_animations=True, animation_filepath=anim_path)

print("\n--- BLENDER OBJECTS ---")
for obj in bpy.data.objects:
    print(f"Object: {obj.name}, Type: {obj.type}, Parent: {obj.parent.name if obj.parent else None}, Parent Type: {obj.parent_type}, Bone: {obj.parent_bone}")
    if obj.type == 'MESH':
        print(f"  Location: {obj.location}")
        print(f"  Matrix World Loc: {obj.matrix_world.to_translation()}")
        print(f"  Vertex Groups: {[vg.name for vg in obj.vertex_groups]}")
        print(f"  Modifiers: {[m.name + ' (' + m.type + ')' for m in obj.modifiers]}")

arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
print("\n--- BONES IN ARMATURE ---")
for b in arm.data.bones:
    if any(k in b.name.lower() for k in ['hand', 'equip', 'object', 'hammer']):
        print(f"  Bone: {b.name}, Parent: {b.parent.name if b.parent else None}, Head: {b.head_local}")
