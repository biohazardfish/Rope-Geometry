import bpy, json, sys, math
from mathutils import Vector
source, blend, mode, report = sys.argv[sys.argv.index('--')+1:]
doc=json.load(open(source)); c=doc['candidate']['spec']['column']
if mode=='column':
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=c['radius'],depth=c['length'],rotation=(0,math.pi/2,0))
    bpy.context.object.name='Column'; bpy.context.scene.unit_settings.system='METRIC'; bpy.context.scene.unit_settings.scale_length=1
    bpy.ops.wm.save_as_mainfile(filepath=blend)
else:
    maximum=0
    for rope in doc['ropes']:
        o=bpy.data.objects[rope['id']]; pts=o.data.splines[0].points
        assert len(pts)==len(rope['points'])
        for p,q in zip(pts,rope['points']):
            maximum=max(maximum,max(abs(p.co[k]-q[k]) for k in range(3)))
        maximum=max(maximum,abs(o.data.bevel_depth-rope['diameter']/2))
        assert max(abs(o.matrix_world[i][j]-(1 if i==j else 0)) for i in range(4) for j in range(4))<1e-7
    o=bpy.data.objects['Column']; axis=o.matrix_world.to_3x3()@Vector((0,0,1))
    axis_error=(axis-Vector((1,0,0))).length
    bpy.context.view_layer.update()
    vertices=[o.matrix_world@v.co for v in o.data.vertices]
    extents=[max(v[i] for v in vertices)-min(v[i] for v in vertices) for i in range(3)]
    maximum=max(maximum,max(abs(extents[i]-[c['length'],2*c['radius'],2*c['radius']][i]) for i in range(3)),o.location.length)
    print('PHASE5_ERRORS',maximum,axis_error)
    assert maximum<1e-7 and axis_error<1e-7
    json.dump({'passed':True,'maxCoordinateRadiusColumnErrorM':maximum,'columnAxisError':axis_error,'source':source,'blend':blend,'scope':'Interchange fidelity only; not knot correctness'},open(report,'w'),indent=2)
