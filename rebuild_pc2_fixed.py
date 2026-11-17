import sys, os
import bpy

sys.path.append(r'C:\Users\JP\Desktop\Dotin\MT2Client\blendergranny')
import io_scene_gr2
from io_scene_gr2 import _create_animation_actions
from io_scene_gr2.gr2.file import read_gr2
from io_scene_gr2.gr2.fixup import load_sections
from io_scene_gr2.gr2.animation import extract_animation_set

try:
    io_scene_gr2.register()
except Exception:
    pass

base_pc = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted\pc'
base_pc2 = r'C:\Users\JP\Desktop\Dotin\MT2Client\extracted\pc2'
out_dir = r'C:\Users\JP\Desktop\Dotin\client\public\assets\models'

def create_pbr_mat(name, dds_path, roughness=0.6, metallic=0.1, is_hair=False):
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
        
        if is_hair:
            links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
            mat.blend_method = 'CLIP'
            mat.alpha_threshold = 0.5
            mat.shadow_method = 'CLIP'
            
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return mat

characters = [
    # 1. Ninja Male 1 & 2 (pc2/assassin)
    {
        'key': 'ninja_male_1',
        'mesh': os.path.join(base_pc2, 'assassin', 'assassin_novice.gr2'),
        'hair': os.path.join(base_pc2, 'assassin', 'hair', 'hair_1_1.gr2'),
        'hair_dds': os.path.join(base_pc2, 'assassin', 'assassin_hair_01.dds'),
        'body_dds': os.path.join(base_pc2, 'assassin', 'assassin_novice_green.dds'),
        'face_dds': os.path.join(base_pc2, 'assassin', 'assassin_face.dds'),
        'wait': os.path.join(base_pc2, 'assassin', 'general', 'wait.gr2'),
        'anims': {
            'walk': os.path.join(base_pc2, 'assassin', 'general', 'walk.gr2'),
            'run': os.path.join(base_pc2, 'assassin', 'general', 'run.gr2'),
            'attack': os.path.join(base_pc2, 'assassin', 'general', 'attack.gr2'),
        },
        'out': os.path.join(out_dir, 'ninja_male_1.glb')
    },
    {
        'key': 'ninja_male_2',
        'mesh': os.path.join(base_pc2, 'assassin', 'assassin_novice.gr2'),
        'hair': os.path.join(base_pc2, 'assassin', 'hair', 'hair_1_1.gr2'),
        'hair_dds': os.path.join(base_pc2, 'assassin', 'assassin_hair_01.dds'),
        'body_dds': os.path.join(base_pc2, 'assassin', 'assassin_novice_red.dds'),
        'face_dds': os.path.join(base_pc2, 'assassin', 'assassin_face.dds'),
        'wait': os.path.join(base_pc2, 'assassin', 'general', 'wait.gr2'),
        'anims': {
            'walk': os.path.join(base_pc2, 'assassin', 'general', 'walk.gr2'),
            'run': os.path.join(base_pc2, 'assassin', 'general', 'run.gr2'),
            'attack': os.path.join(base_pc2, 'assassin', 'general', 'attack.gr2'),
        },
        'out': os.path.join(out_dir, 'ninja_male_2.glb')
    },
    # 2. Shaman Male 1 & 2 (pc2/shaman)
    {
        'key': 'shaman_male_1',
        'mesh': os.path.join(base_pc2, 'shaman', 'shaman_novice.gr2'),
        'hair': os.path.join(base_pc2, 'shaman', 'hair', 'hair_1_1.gr2'),
        'hair_dds': os.path.join(base_pc2, 'shaman', 'shaman_hair_01.dds'),
        'body_dds': os.path.join(base_pc2, 'shaman', 'shaman_novice_green.dds'),
        'face_dds': os.path.join(base_pc2, 'shaman', 'shaman_face.dds'),
        'wait': os.path.join(base_pc2, 'shaman', 'general', 'wait.gr2'),
        'anims': {
            'walk': os.path.join(base_pc2, 'shaman', 'general', 'walk.gr2'),
            'run': os.path.join(base_pc2, 'shaman', 'general', 'run.gr2'),
            'attack': os.path.join(base_pc2, 'shaman', 'general', 'attack.gr2'),
        },
        'out': os.path.join(out_dir, 'shaman_male_1.glb')
    },
    {
        'key': 'shaman_male_2',
        'mesh': os.path.join(base_pc2, 'shaman', 'shaman_novice.gr2'),
        'hair': os.path.join(base_pc2, 'shaman', 'hair', 'hair_1_1.gr2'),
        'hair_dds': os.path.join(base_pc2, 'shaman', 'shaman_hair_01.dds'),
        'body_dds': os.path.join(base_pc2, 'shaman', 'shaman_novice_red.dds'),
        'face_dds': os.path.join(base_pc2, 'shaman', 'shaman_face.dds'),
        'wait': os.path.join(base_pc2, 'shaman', 'general', 'wait.gr2'),
        'anims': {
            'walk': os.path.join(base_pc2, 'shaman', 'general', 'walk.gr2'),
            'run': os.path.join(base_pc2, 'shaman', 'general', 'run.gr2'),
            'attack': os.path.join(base_pc2, 'shaman', 'general', 'attack.gr2'),
        },
        'out': os.path.join(out_dir, 'shaman_male_2.glb')
    }
]

for char in characters:
    print(f"\n==========================================")
    print(f"Building {char['key']}...")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    
    # 1. Import body mesh with wait animation
    bpy.ops.import_scene.gr2_native(filepath=char['mesh'], import_animations=True, animation_filepath=char['wait'])
    
    arm_obj = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
    for act in list(bpy.data.actions):
        act.name = 'idle'
        
    # 2. Import extra animations correctly
    for anim_name, anim_path in char['anims'].items():
        if os.path.exists(anim_path):
            try:
                anim_loaded = load_sections(read_gr2(anim_path))
                anim_set = extract_animation_set(anim_loaded)
                if anim_set and anim_set.animations:
                    existing_actions = set(bpy.data.actions.keys())
                    _create_animation_actions(anim_set, [arm_obj], bpy.context.scene)
                    new_actions = set(bpy.data.actions.keys()) - existing_actions
                    for na in new_actions:
                        bpy.data.actions[na].name = anim_name
                        print(f"  Loaded anim: {anim_name}")
            except Exception as e:
                print(f"  Anim error {anim_name}: {e}")
                
    # 3. Import hair mesh
    if os.path.exists(char['hair']):
        bpy.ops.import_scene.gr2_native(filepath=char['hair'], import_animations=False)
        hair_objs = [o for o in bpy.data.objects if o.type == 'MESH' and 'hair' in o.name.lower()]
        for h in hair_objs:
            h.parent = arm_obj
            if not any(m.type == 'ARMATURE' for m in h.modifiers):
                mod = h.modifiers.new(name="Armature", type='ARMATURE')
                mod.object = arm_obj
        print(f"  Loaded hair mesh: {char['hair']}")
        
    # 4. Materials
    hair_mat = create_pbr_mat(f"{char['key']}_Hair", char['hair_dds'], roughness=0.7, metallic=0.0, is_hair=True)
    body_mat = create_pbr_mat(f"{char['key']}_Body", char['body_dds'], roughness=0.6, metallic=0.1)
    face_mat = create_pbr_mat(f"{char['key']}_Face", char['face_dds'], roughness=0.7, metallic=0.0)
    
    for m in [o for o in bpy.data.objects if o.type == 'MESH']:
        m_name = m.name.lower()
        m.data.materials.clear()
        if 'hair' in m_name:
            m.data.materials.append(hair_mat)
            print(f"  Applied Hair_Mat to {m.name}")
        elif 'face' in m_name:
            m.data.materials.append(face_mat)
            print(f"  Applied Face_Mat to {m.name}")
        else:
            m.data.materials.append(body_mat)
            print(f"  Applied Body_Mat to {m.name}")
            
    # 5. Push all actions to NLA tracks for clean GLB export
    if arm_obj.animation_data:
        for act in list(bpy.data.actions):
            track = arm_obj.animation_data.nla_tracks.new()
            track.name = act.name
            track.strips.new(act.name, int(act.frame_range[0]), act)
            
    # 6. Export GLB
    bpy.ops.export_scene.gltf(
        filepath=char['out'],
        export_format='GLB',
        export_materials='EXPORT',
        export_apply=False,
        export_animations=True
    )
    print(f"Successfully exported {char['key']} -> {char['out']} ({os.path.getsize(char['out'])} bytes)")

print("\n=== PC2 REBUILD COMPLETED ===")
