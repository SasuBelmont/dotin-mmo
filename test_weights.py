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

armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
arm = armatures[0]
for act in list(bpy.data.actions):
    act.name = 'idle'
    track = arm.animation_data.nla_tracks.new()
    track.name = 'idle'
    track.strips.new('idle', int(act.frame_range[0]), act)

# Check modifiers on Object02 and Object03
for name in ['Object01', 'Object02', 'Object03']:
    obj = bpy.data.objects[name]
    print(f"\nMesh {name}:")
    for mod in obj.modifiers:
        print(f"  Mod: {mod.name}, type: {mod.type}")
        if mod.type == 'ARMATURE':
            print(f"    object: {mod.object.name if mod.object else None}")
    # Check vertex weights
    for vg in obj.vertex_groups:
        weights = []
        for v in obj.data.vertices:
            for g in v.groups:
                if g.group == vg.index:
                    weights.append(g.weight)
        print(f"  VG '{vg.name}': {len(weights)} vertices with weight, avg weight: {sum(weights)/len(weights) if weights else 0}")
