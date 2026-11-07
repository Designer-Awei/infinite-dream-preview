"""Build offline preview metadata, readable review boards and a small font subset."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from fontTools import subset

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'art/pets/approved-v1'
FONT=ROOT.parent/'.cache/Cubic_11.ttf'

def build():
    meta=json.loads((OUT/'pets.json').read_text(encoding='utf-8'))
    (OUT/'preview-data.js').write_text('window.PET_DATA = '+json.dumps(meta,ensure_ascii=False)+';\n',encoding='utf-8')
    names=['赤焰火龙','霆尾灵狐','霜羽冰凰']
    board=Image.new('RGB',(1000,770),'#181329');d=ImageDraw.Draw(board)
    font=ImageFont.truetype(str(FONT),24);small=ImageFont.truetype(str(FONT),18)
    d.text((28,22),'用户底图 · 三种宠物 / 九个进化形态',font=font,fill='#eee8ff')
    for i,label in enumerate(['幼年形态','成长形态','终阶形态']):d.text((285+i*250,72),label,font=small,fill='#b3a9c9')
    for row,family in enumerate(['dragon','fox','phoenix']):
        y=122+row*210
        d.text((24,y+72),names[row],font=font,fill=['#ff9860','#ffe69c','#8fe6ff'][row])
        for stage in range(1,4):
            im=Image.open(OUT/f'{family}-{stage}/base.png').resize((192,192),Image.Resampling.NEAREST)
            board.paste(im,(240+(stage-1)*250,y),im)
    board.save(OUT/'evolution-overview.png')
    # A quiet close-up loop makes breathing, wing articulation and tail motion visible.
    atlas=Image.open(OUT/'pets.png').convert('RGBA');gif=[]
    for frame in range(8):
        image=Image.new('RGB',(1200,400),'#181329');draw=ImageDraw.Draw(image)
        for col,family in enumerate(['dragon','fox','phoenix']):
            draw.text((col*400+26,16),names[col],font=font,fill=['#ff9860','#ffe69c','#8fe6ff'][col])
            positions=meta['clips'][family+'-3']['idle_e'];x,y=positions[frame%(len(positions)-1)]
            sprite=atlas.crop((x,y,x+128,y+128)).resize((288,288),Image.Resampling.NEAREST)
            image.paste(sprite,(col*400+30,54),sprite)
            draw.text((col*400+26,365),'待机：呼吸 / 翼动 / 尾摆',font=small,fill='#b3a9c9')
        gif.append(image)
    gif[0].save(OUT/'idle-preview.gif',save_all=True,append_images=gif[1:],duration=167,loop=0,disposal=2,optimize=False)
    # APNG retains the provider's 256px frames and full colors; integer 2x display only.
    original=[]
    for frame in range(8):
        image=Image.new('RGBA',(1536,600),'#181329');draw=ImageDraw.Draw(image)
        for col,family in enumerate(['dragon','fox','phoenix']):
            draw.text((col*512+24,16),names[col]+' · 原始256帧',font=font,fill='#eee8ff')
            raw=Image.open(OUT/(family+'-3')/'idle-256.png').convert('RGBA')
            sprite=raw.crop((frame*256,0,(frame+1)*256,256)).resize((512,512),Image.Resampling.NEAREST)
            image.alpha_composite(sprite,(col*512,62))
        original.append(image)
    original[0].save(OUT/'idle-original-256.png',save_all=True,append_images=original[1:],duration=167,loop=0,disposal=0,blend=0)
    # Each cell is shown once, with clear frame boundaries, avoiding overlapping sheets.
    for clip in ['cast','idle','move']:
        cols=max(len(meta['clips'][pid][clip+'_e']) for pid in meta['actors'])
        review=Image.new('RGB',(cols*144,9*169),'#181329');d=ImageDraw.Draw(review)
        for row,pid in enumerate(meta['actors']):
            sheet=Image.open(OUT/pid/f'{clip}.png')
            for frame in range(len(meta['clips'][pid][clip+'_e'])):
                im=sheet.crop((frame*128,0,(frame+1)*128,128)).resize((144,144),Image.Resampling.NEAREST)
                x=frame*144;y=row*169+25;review.paste(im,(x,y),im)
            d.text((5,row*169+3),pid,font=small,fill='#d4c7e7')
        review.save(OUT/f'{clip}-review.png')
    strings=''.join((OUT/p).read_text(encoding='utf-8') for p in ['preview.html','preview-effects.js'])
    options=subset.Options();options.flavor='woff2'
    f=subset.load_font(str(FONT),options);s=subset.Subsetter(options=options);s.populate(text=strings);s.subset(f);subset.save_font(f,str(OUT/'preview-font.woff2'),options)
    print('Built nine-stage overview, full body-frame review, offline manifest and preview font.')

if __name__=='__main__':build()
