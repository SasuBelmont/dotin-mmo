import sys, os
import bpy

sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client\blendergranny')
import io_scene_gr2
try:
    io_scene_gr2.register()
except Exception:
    pass

bpy.ops.wm.read_factory_settings(use_empty=True)
gr2_path = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted\npc\doctor\doctor.gr2'
bpy.ops.import_scene.gr2_native(filepath=gr2_path, import_animations=False)
print("\n--- DOCTOR ---")
for m in [o for o in bpy.data.objects if o.type == 'MESH']:
    print(f"Mesh: {m.name}, verts: {len(m.data.vertices)}")
