import sys, os
import bpy

sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client\blendergranny')
import io_scene_gr2
try:
    io_scene_gr2.register()
except Exception:
    pass

bld_dir = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted\zone\b\building'
obj_dir = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted\zone\b\obj'
out_dir = r'C:\Users\JP\Desktop\Dotin\client\public\assets\models'

def set_material(obj, tex_path, mat_name="Mat"):
    mat = bpy.data.materials.new(name=mat_name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    
    if os.path.exists(tex_path):
        tex_node = nodes.new("ShaderNodeTexImage")
        img = bpy.data.images.load(tex_path)
        tex_node.image = img
        links.new(tex_node.outputs['Color'], bsdf.inputs['Base Color'])
        if 'Alpha' in tex_node.outputs and 'Alpha' in bsdf.inputs:
            links.new(tex_node.outputs['Alpha'], bsdf.inputs['Alpha'])
    
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat

# 1. EXPORT BANK (WITH FIXED ROOF TEXTURE)
print("\n--- BUILDING BANK WITH FIXED ROOF ---")
bpy.ops.wm.read_factory_settings(use_empty=True)
bank_gr2 = os.path.join(bld_dir, 'b1-010-bank.gr2')
bpy.ops.import_scene.gr2_native(filepath=bank_gr2, import_animations=False)

for obj in bpy.data.objects:
    if obj.type == 'MESH':
        name = obj.name.lower()
        if '01' in name:
            tex = os.path.join(bld_dir, 'b1-010-bank-01.dds')
            set_material(obj, tex, "Bank_Wall")
        elif '02' in name:
            tex = os.path.join(bld_dir, 'b1-010-bank-02.dds')
            set_material(obj, tex, "Bank_Roof")
            print("Successfully assigned b1-010-bank-02.dds to ROOF mesh:", obj.name)
        elif '03' in name:
            tex = os.path.join(bld_dir, 'b1-010-bank-03.dds')
            set_material(obj, tex, "Bank_Base")
        elif '04' in name:
            tex = os.path.join(bld_dir, 'b1-010-bank-04.dds')
            set_material(obj, tex, "Bank_Trim")

bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, 'building_bank.glb'), export_format='GLB')
print("Exported building_bank.glb")

# 2. EXPORT HOUSE 5 (GENUINE METIN2 VILLAGE HOUSE WITH ROOF)
print("\n--- BUILDING HOUSE 5 WITH BLUE TILE ROOF ---")
bpy.ops.wm.read_factory_settings(use_empty=True)
house_gr2 = os.path.join(bld_dir, 'b1-008-house5.gr2')
bpy.ops.import_scene.gr2_native(filepath=house_gr2, import_animations=False)

for obj in bpy.data.objects:
    if obj.type == 'MESH':
        name = obj.name.lower()
        if '01' in name:
            tex = os.path.join(bld_dir, 'b1-008-house5-01.dds')
            set_material(obj, tex, "House_Wall")
        elif '02' in name:
            tex = os.path.join(bld_dir, 'b1-008-house5-02.dds')
            set_material(obj, tex, "House_Roof")
            print("Successfully assigned b1-008-house5-02.dds to House ROOF:", obj.name)
        elif '03' in name:
            tex = os.path.join(bld_dir, 'b1-008-house5-03.dds')
            set_material(obj, tex, "House_Timber")

bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, 'house.glb'), export_format='GLB')
print("Exported house.glb")

# 3. EXPORT FISHING BOAT
print("\n--- FISHING BOAT ---")
bpy.ops.wm.read_factory_settings(use_empty=True)
boat_gr2 = os.path.join(obj_dir, 'general_obj_boat01.gr2')
bpy.ops.import_scene.gr2_native(filepath=boat_gr2, import_animations=False)
boat_tex = os.path.join(obj_dir, 'general_obj_ferryboat.dds')
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        set_material(obj, boat_tex, "Boat_Mat")

bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, 'fishing_boat.glb'), export_format='GLB')
print("Exported fishing_boat.glb")

# 4. EXPORT WOOD BARREL
print("\n--- WOOD BARREL ---")
bpy.ops.wm.read_factory_settings(use_empty=True)
barrel_gr2 = os.path.join(obj_dir, 'ob-b1-005-woodbarrel.gr2')
bpy.ops.import_scene.gr2_native(filepath=barrel_gr2, import_animations=False)
barrel_tex = os.path.join(obj_dir, 'b-general_wbridge01.dds')
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        set_material(obj, barrel_tex, "Barrel_Mat")

bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, 'wood_barrel.glb'), export_format='GLB')
print("Exported wood_barrel.glb")

# 5. EXPORT CAMPFIRE
print("\n--- CAMPFIRE ---")
bpy.ops.wm.read_factory_settings(use_empty=True)
camp_gr2 = os.path.join(obj_dir, 'general_obj_campfire.gr2')
bpy.ops.import_scene.gr2_native(filepath=camp_gr2, import_animations=False)
camp_tex = os.path.join(obj_dir, 'b-general_wbridge01.dds')
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        set_material(obj, camp_tex, "Campfire_Wood")

bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, 'campfire.glb'), export_format='GLB')
print("Exported campfire.glb")

print("\nALL ASSETS BUILT AND EXPORTED SUCCESSFULLY!")
