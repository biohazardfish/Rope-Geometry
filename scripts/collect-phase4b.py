"""Cache only the explicitly selected reference photographs; no inference from hashes."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.request import urlopen
from urllib.parse import urljoin
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw
import json,hashlib,subprocess
base=Path('references/phase4b'); rows=[]
class Parser(HTMLParser):
 def __init__(self,source): super().__init__();self.source=source;self.duchy=0;self.untie=0
 def handle_starttag(self,tag,attrs):
  a=dict(attrs);src=a.get('src','');alt=a.get('alt','')
  if tag!='img':return
  if self.source=='original' and '/blog/files/' in src:
   if len([r for r in rows if r['source']=='original'])>=11:return
   ident=Path(src).stem;url=urljoin('https://crash-restraint.com',src)
  elif self.source=='duchy' and (alt.startswith('Somerville Bowline -') and not 'Slipped' in alt):
   if alt.startswith('Somerville Bowline - Untying'):
    ident='duchy-untie-'+alt.split('-')[-1]
   else:
    self.duchy+=1; ident='duchy-detail-'+str(self.duchy) # visible position; step 25 shares untie-1
    if self.duchy==25:ident='duchy-detail-26'
   url=src.split('?')[0]
   if any(r['id']==ident for r in rows):return
  elif self.source=='duchy' and alt=='Somerville Bowline - Slipped-13':
   ident='duchy-untie-7';url=src.split('?')[0]
   if any(r['id']==ident for r in rows):return
  else:return
  rows.append(dict(id=ident,source=self.source,alt=alt,url=url,path=str(base/(ident+'.jpg'))))
for source in ['original','duchy']:Parser(source).feed((base/(source+'.html')).read_text())
def fetch(r):
 p=Path(r['path'])
 if not p.exists():p.write_bytes(urlopen(r['url'],timeout=25).read())
 r['sha256']=hashlib.sha256(p.read_bytes()).hexdigest()
with ThreadPoolExecutor(max_workers=8) as pool:list(pool.map(fetch,rows))
(base/'image-manifest.json').write_text(json.dumps(rows,indent=2)+'\n')
def sheet(items,name,cols=4):
 out=Image.new('RGB',(cols*320,350*((len(items)+cols-1)//cols)),'white');d=ImageDraw.Draw(out)
 for i,(label,path) in enumerate(items):
  im=Image.open(path).convert('RGB');im.thumbnail((310,310));x=(i%cols)*320;y=(i//cols)*350
  out.paste(im,(x,y+28));d.text((x+4,y+6),label,fill='black')
 out.save(base/(name+'.jpg'))
for source in ['original','duchy']:
 rr=[r for r in rows if r['source']==source]
 for offset in range(0,len(rr),12):sheet([(r['id'],r['path']) for r in rr[offset:offset+12]],f'{source}-sheet-{offset//12}')
for tag,video,ts in [('duchy','01-TheDuchy-RightHanded.mp4',list(range(12,149,8))+[149,154,260,269,274]),('topologist','02-Topologist-SingleColumn.mp4',list(range(0,200,12)))]:
 items=[]
 for t in ts:
  p=base/f'{tag}-video-{t:03d}.jpg'
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-ss',str(t),'-i','references/video/'+video,'-frames:v','1','-update','1','-y',str(p)],check=True)
  items.append((f'{tag} {t}s',p))
 for offset in range(0,len(items),12):sheet(items[offset:offset+12],f'{tag}-video-sheet-{offset//12}')
print('cached',len(rows),'photos and video samples')
