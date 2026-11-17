import bpy, json

bpy.ops.wm.read_factory_settings(use_empty=True)
mat = bpy.data.materials.new(name="Mat")
mat.blend_method = 'CLIP'
mat.alpha_threshold = 0.5
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get('Principled BSDF')

# Create a cube
bpy.ops.mesh.primitive_cube_add()
cube = bpy.context.active_object
cube.data.materials.append(mat)

test_path = r'C:\Users\JP\Desktop\Dotin\test_clip.glb'
bpy.ops.export_scene.gltf(filepath=test_path, export_format='GLB')

with open(test_path, 'rb') as f:
    f.seek(12)
    chunk_len = int.from_bytes(f.read(4), 'little')
    f.read(4)
    gltf = json.loads(f.read(chunk_len))
print("Exported material:", gltf['materials'])
