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
dds_path = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted\npc\blacksmith\blacksmith.dds'

bpy.ops.import_scene.gr2_native(filepath=gr2_path, import_animations=True, animation_filepath=anim_path)

arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
for act in list(bpy.data.actions):
    act.name = 'idle'
    track = arm.animation_data.nla_tracks.new()
    track.name = 'idle'
    track.strips.new('idle', int(act.frame_range[0]), act)

# Assign all vertices in Object02 to bone Object02 with weight 1.0
o2 = bpy.data.objects['Object02']
vg2 = o2.vertex_groups.get('Object02')
if not vg2:
    vg2 = o2.vertex_groups.new(name='Object02')
all_v2 = [v.index for v in o2.data.vertices]
vg2.add(all_v2, 1.0, 'REPLACE')
print(f"Object02: assigned {len(all_v2)} vertices to VG Object02")

# Assign all vertices in Object03 to bone Object03 with weight 1.0
o3 = bpy.data.objects['Object03']
vg3 = o3.vertex_groups.get('Object03')
if not vg3:
    vg3 = o3.vertex_groups.new(name='Object03')
all_v3 = [v.index for v in o3.data.vertices]
vg3.add(all_v3, 1.0, 'REPLACE')
print(f"Object03: assigned {len(all_v3)} vertices to VG Object03")

# Setup material
mat = bpy.data.materials.new(name="blacksmith_Mat")
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links
bsdf = nodes.get('Principled BSDF')
img = bpy.data.images.load(dds_path)
tex = nodes.new(type='ShaderNodeTexImage')
tex.image = img
links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.6
bsdf.inputs['Metallic'].default_value = 0.1

for m in [o for o in bpy.data.objects if o.type == 'MESH']:
    m.data.materials.clear()
    m.data.materials.append(mat)

test_out = r'C:\Users\JP\Desktop\Dotin\MT2Client\blacksmith_fixed.glb'
bpy.ops.export_scene.gltf(
    filepath=test_out,
    export_format='GLB',
    export_materials='EXPORT',
    export_apply=False, # Must be False for armature/skinning!
    export_animations=True
)
print(f"Exported test -> {test_out}")
