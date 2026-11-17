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

for m in [o for o in bpy.data.objects if o.type == 'MESH']:
    print(f"\nMesh {m.name}: {len(m.data.vertices)} vertices")
    for vg in m.vertex_groups:
        count = sum(1 for v in m.data.vertices for g in v.groups if g.group == vg.index)
        if count > 0:
            print(f"  VG {vg.name}: {count} vertices")
        else:
            print(f"  VG {vg.name}: 0 vertices (EMPTY!)")
