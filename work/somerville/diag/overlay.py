import json,sys,math
from PIL import Image,ImageDraw
doc=json.load(open(sys.argv[1]));out=sys.argv[2]
ann=json.load(open('data/somerville-pose148.json'))
cam=doc['somerville'].get('pose',{}).get('camera') or {'pixelsPerMetre':5000,'originPixel':[460,555],'rollRadians':0}
c,s,ppm=math.cos(cam['rollRadians']),math.sin(cam['rollRadians']),cam['pixelsPerMetre'];u0,v0=cam['originPixel']
img=Image.open('references/phase4b/duchy-video-148.jpg').convert('RGB').resize((1280,1280));d=ImageDraw.Draw(img)
P=doc['ropes'][0]['points'];L=doc['ropes'][0]['segmentLabels']
col={'cuff':(0,170,255),'tail':(255,120,0),'loop':(255,0,200),'bight':(0,200,80),'fold':(0,200,80),'over':(255,0,0),'outside':(255,0,0),'under':(160,0,255),'return':(255,255,0),'first':(0,255,255)}
for i in range(len(P)-1):
  r=L[i].split('-')[0].split('/')[0];color=col.get(r,(255,255,255))
  a=(u0+ppm*(c*P[i][0]+s*P[i][2]),v0+ppm*(s*P[i][0]-c*P[i][2]));b=(u0+ppm*(c*P[i+1][0]+s*P[i+1][2]),v0+ppm*(s*P[i+1][0]-c*P[i+1][2]))
  d.line([a,b],fill=color,width=3)
for pl in ann['visiblePolylines']:
  d.line([tuple(p) for p in pl['points']],fill=(0,0,0),width=2)
bx=ann['lockingCoreRegion'];d.rectangle(bx,outline=(0,0,0),width=2)
img.resize((900,900)).save(out)
