import bpy, os

for name in ['house.glb', 'building_bank.glb', 'itemshop.glb']:
    path = os.path.join(r'C:\Users\JP\Desktop\Dotin\client\public\assets\models', name)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    print(f'=== {name} ===')
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            print(f'Mesh: {obj.name}')
            for mat in obj.data.materials:
                if mat:
                    print(f'  Mat: {mat.name}')
                    if mat.node_tree:
                        for node in mat.node_tree.nodes:
                            if node.type == 'TEX_IMAGE':
                                print(f'    Tex: {node.image.name if node.image else "NO_IMAGE"}')
                    else:
                        print('  No node tree!')
                else:
                    print('  NO MATERIAL!')
