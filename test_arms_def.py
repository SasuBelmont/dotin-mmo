import sys, os
import bpy

sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client\blendergranny')
import io_scene_gr2
try:
    io_scene_gr2.register()
except Exception:
    pass

for name in ['arms', 'defence']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    gr2_path = f'C:\\Users\\JP\\Desktop\\Dotin\\MT2Client\\extracted\\npc\\{name}\\{name}.gr2'
    bpy.ops.import_scene.gr2_native(filepath=gr2_path, import_animations=False)
    print(f"\n--- {name.upper()} ---")
    for m in [o for o in bpy.data.objects if o.type == 'MESH']:
        print(f"Mesh: {m.name}, verts: {len(m.data.vertices)}")
        for vg in m.vertex_groups:
            count = sum(1 for v in m.data.vertices for g in v.groups if g.group == vg.index)
            if count == 0:
                print(f"  EMPTY VG: {vg.name}")
