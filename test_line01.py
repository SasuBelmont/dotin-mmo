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
bpy.ops.import_scene.gr2_native(filepath=gr2_path, import_animations=False)

arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
for b in arm.data.bones:
    if 'line' in b.name.lower():
        print(f"Bone: {b.name}, Parent: {b.parent.name if b.parent else None}")
