import sys, os
import bpy

sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client\blendergranny')
import io_scene_gr2
try:
    io_scene_gr2.register()
except Exception:
    pass

base_dir = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted'
out_dir = r'C:\Users\JP\Desktop\Dotin\client\public\assets\models'
os.makedirs(out_dir, exist_ok=True)

def push_idle_nla(arm):
    """Move first action to NLA track named 'idle'."""
    if not arm.animation_data:
        return
    for act in list(bpy.data.actions):
        act.name = 'idle'
        track = arm.animation_data.nla_tracks.new()
        track.name = 'idle'
        track.strips.new('idle', int(act.frame_range[0]), act)
        break  # only the first action

def create_pbr_mat(name, dds_path, roughness=0.6, metallic=0.1):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    if os.path.exists(dds_path):
        img = bpy.data.images.load(dds_path)
        tex = nodes.new(type='ShaderNodeTexImage')
        tex.image = img
        links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return mat

def export_glb(filepath, with_anim=False):
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        export_materials='EXPORT',
        export_apply=False,
        export_animations=with_anim
    )
    if os.path.exists(filepath):
        print(f"  Exported -> {filepath} ({os.path.getsize(filepath)} bytes)")
    else:
        print(f"  ERROR: {filepath} not created!")

# ==========================================
# 1. BLACKSMITH (fix tool skinning)
# ==========================================
print("\n--- 1. Converting Blacksmith (fixed tools) ---")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gr2_native(
    filepath=os.path.join(base_dir, 'npc', 'blacksmith', 'blacksmith.gr2'),
    import_animations=True,
    animation_filepath=os.path.join(base_dir, 'npc', 'blacksmith', 'wait.gr2')
)
# Assign all vertices in Object02 to its bone VG (weight 1.0)
for mesh_name, vg_name in [('Object02', 'Object02'), ('Object03', 'Object03')]:
    obj = bpy.data.objects.get(mesh_name)
    if obj:
        vg = obj.vertex_groups.get(vg_name) or obj.vertex_groups.new(name=vg_name)
        all_verts = [v.index for v in obj.data.vertices]
        vg.add(all_verts, 1.0, 'REPLACE')
        print(f"  Fixed {mesh_name}: {len(all_verts)} verts -> VG '{vg_name}'")
# Assign material
mat = create_pbr_mat('blacksmith_Mat', os.path.join(base_dir, 'npc', 'blacksmith', 'blacksmith.dds'))
for m in [o for o in bpy.data.objects if o.type == 'MESH']:
    m.data.materials.clear()
    m.data.materials.append(mat)
# Push idle to NLA
arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
if arms:
    push_idle_nla(arms[0])
export_glb(os.path.join(out_dir, 'blacksmith.glb'), with_anim=True)

# ==========================================
# 2. GUARD LEADER (authentic Metin2 guardian NPC)
# ==========================================
print("\n--- 2. Converting Guard Leader ---")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gr2_native(
    filepath=os.path.join(base_dir, 'npc', 'guard_leader', 'guard_leader.gr2'),
    import_animations=True,
    animation_filepath=os.path.join(base_dir, 'npc', 'guard_leader', 'wait.gr2')
)
# Fix Line01 (spear/halberd) - assign all verts to Line01 VG with weight 1.0
line_obj = bpy.data.objects.get('Line01')
if line_obj:
    vg = line_obj.vertex_groups.get('Line01') or line_obj.vertex_groups.new(name='Line01')
    all_verts = [v.index for v in line_obj.data.vertices]
    vg.add(all_verts, 1.0, 'REPLACE')
    print(f"  Fixed Line01: {len(all_verts)} verts -> VG 'Line01'")
mat = create_pbr_mat('guard_leader_Mat', os.path.join(base_dir, 'npc', 'guard_leader', 'guard_leader.dds'))
for m in [o for o in bpy.data.objects if o.type == 'MESH']:
    m.data.materials.clear()
    m.data.materials.append(mat)
arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
if arms:
    push_idle_nla(arms[0])
export_glb(os.path.join(out_dir, 'guard_leader.glb'), with_anim=True)

# ==========================================
# 3. ARMS (weapons merchant NPC)
# ==========================================
print("\n--- 3. Converting Arms Merchant ---")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gr2_native(
    filepath=os.path.join(base_dir, 'npc', 'arms', 'arms.gr2'),
    import_animations=True,
    animation_filepath=os.path.join(base_dir, 'npc', 'arms', 'wait.gr2')
)
mat = create_pbr_mat('arms_Mat', os.path.join(base_dir, 'npc', 'arms', 'arms.dds'))
for m in [o for o in bpy.data.objects if o.type == 'MESH']:
    m.data.materials.clear()
    m.data.materials.append(mat)
arms_list = [o for o in bpy.data.objects if o.type == 'ARMATURE']
if arms_list:
    push_idle_nla(arms_list[0])
export_glb(os.path.join(out_dir, 'arms_npc.glb'), with_anim=True)

# ==========================================
# 4. DEFENCE (city guard NPC)
# ==========================================
print("\n--- 4. Converting Defence NPC ---")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gr2_native(
    filepath=os.path.join(base_dir, 'npc', 'defence', 'defence.gr2'),
    import_animations=True,
    animation_filepath=os.path.join(base_dir, 'npc', 'defence', 'wait.gr2')
)
mat = create_pbr_mat('defence_Mat', os.path.join(base_dir, 'npc', 'defence', 'defence.dds'))
for m in [o for o in bpy.data.objects if o.type == 'MESH']:
    m.data.materials.clear()
    m.data.materials.append(mat)
arms_list = [o for o in bpy.data.objects if o.type == 'ARMATURE']
if arms_list:
    push_idle_nla(arms_list[0])
export_glb(os.path.join(out_dir, 'defence_npc.glb'), with_anim=True)

# ==========================================
# 5. MARKET BOARD (ob-standganpan-01.gr2)
# ==========================================
print("\n--- 5. Converting Market Board ---")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gr2_native(
    filepath=os.path.join(base_dir, 'zone', 'b', 'obj', 'ob-standganpan-01.gr2'),
    import_animations=False
)
mat = create_pbr_mat('board_Mat', os.path.join(base_dir, 'zone', 'b', 'obj', 'ob-standganpan-all.dds'), roughness=0.9, metallic=0.0)
for m in [o for o in bpy.data.objects if o.type == 'MESH']:
    m.data.materials.clear()
    m.data.materials.append(mat)
export_glb(os.path.join(out_dir, 'market_board.glb'), with_anim=False)

# ==========================================
# 6. FURNACE BRAZIER (ob_brazier.gr2 - authentic forge/cauldron)
# ==========================================
print("\n--- 6. Converting Furnace Brazier ---")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gr2_native(
    filepath=os.path.join(base_dir, 'zone', 'b', 'obj', 'ob_brazier.gr2'),
    import_animations=False
)
mat1 = create_pbr_mat('brazier_base_Mat', os.path.join(base_dir, 'zone', 'b', 'obj', 'ob_brazier_01.dds'), roughness=0.8, metallic=0.1)
mat2 = create_pbr_mat('brazier_fire_Mat', os.path.join(base_dir, 'zone', 'b', 'obj', 'ob_brazier_02.dds'), roughness=0.2, metallic=0.0)
# mat2 is the fire bowl top - make emissive
bsdf2 = mat2.node_tree.nodes.get('Principled BSDF')
bsdf2.inputs['Emission Strength'].default_value = 2.0
tex_nodes = [n for n in mat2.node_tree.nodes if n.type == 'TEX_IMAGE']
if tex_nodes:
    mat2.node_tree.links.new(tex_nodes[0].outputs['Color'], bsdf2.inputs['Emission Color'])

mesh_objs = [o for o in bpy.data.objects if o.type == 'MESH']
for i, m in enumerate(mesh_objs):
    m.data.materials.clear()
    if i == 0:
        m.data.materials.append(mat1)
    else:
        m.data.materials.append(mat2)
export_glb(os.path.join(out_dir, 'furnace_brazier.glb'), with_anim=False)

# ==========================================
# 7. GENERAL_BOARD SIGN (zone/b/obj/sign.gr2)
# ==========================================
print("\n--- 7. Converting Sign ---")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gr2_native(
    filepath=os.path.join(base_dir, 'zone', 'b', 'obj', 'sign.gr2'),
    import_animations=False
)
mat = create_pbr_mat('sign_Mat', os.path.join(base_dir, 'zone', 'b', 'obj', 'sign.dds'), roughness=0.9, metallic=0.0)
for m in [o for o in bpy.data.objects if o.type == 'MESH']:
    m.data.materials.clear()
    m.data.materials.append(mat)
export_glb(os.path.join(out_dir, 'sign.glb'), with_anim=False)

print("\n=== ALL CONVERSIONS COMPLETE ===")
