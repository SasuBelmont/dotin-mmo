import bpy

mat = bpy.data.materials.new(name="TestMat")
print("Material properties in Blender 4.2:")
for prop in dir(mat):
    if any(k in prop.lower() for k in ['blend', 'alpha', 'clip', 'transp']):
        print(" ", prop, getattr(mat, prop, None))
