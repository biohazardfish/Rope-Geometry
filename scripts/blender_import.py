import bpy, json, sys

def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) < 2: raise SystemExit('usage: blender --background --python blender_import.py -- INPUT.json OUTPUT.blend [TIME]')
    return argv

def main():
    argv = args(); source, output = argv[:2]; time = float(argv[2]) if len(argv) > 2 else None
    with open(source, encoding='utf-8') as f: doc = json.load(f)
    ropes = doc['ropes']
    if time is not None and 'animation' in doc:
        frames=doc['animation']['frames']
        a=max((x for x in frames if x['time']<=time),key=lambda x:x['time'],default=frames[0]); b=min((x for x in frames if x['time']>=time),key=lambda x:x['time'],default=frames[-1])
        t=0 if a is b else (time-a['time'])/(b['time']-a['time'])
        ropes=[dict(base,points=[[p[k]+(q[k]-p[k])*t for k in range(3)] for p,q in zip(a['ropes'][i]['points'],b['ropes'][i]['points'])]) for i,base in enumerate(ropes)]
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for rope in ropes:
        curve=bpy.data.curves.new(rope['id'],'CURVE'); curve.dimensions='3D'; curve.resolution_u=1; curve.bevel_depth=rope['diameter']/2; curve.bevel_resolution=2
        spline=curve.splines.new('POLY'); spline.points.add(len(rope['points'])-1)
        for point, co in zip(spline.points,rope['points']): point.co=(*co,1)
        obj=bpy.data.objects.new(rope['id'],curve); bpy.context.collection.objects.link(obj); obj['rope_id']=rope['id']; obj['diameter_m']=rope['diameter']
    bpy.ops.wm.save_as_mainfile(filepath=output)

main()
