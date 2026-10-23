import subprocess, textwrap, json
rows=[l.rstrip('\n').split('\t') for l in open('script.tsv',encoding='utf-8') if l.strip()]
FPS=30
def dur(f):
    return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f]).decode().strip())
clips=[]
for i,(img,label,text) in enumerate(rows):
    d=dur(f'vo{i:02d}.wav')+0.7
    n=int(d*FPS)
    open(f'cap{i:02d}.txt','w',encoding='utf-8',newline=chr(10)).write('\n'.join(textwrap.wrap(text,78)))
    open(f'lab{i:02d}.txt','w',encoding='utf-8',newline=chr(10)).write(label)
    vf=(f"[0]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x14110d,"
        f"zoompan=z='1+0.05*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s=1920x1080:fps={FPS},"
        f"drawbox=x=0:y=ih-190:w=iw:h=190:color=0x14110d@0.82:t=fill,"
        f"drawbox=x=60:y=ih-178:w=8:h=34:color=0xf5b21a@1:t=fill,"
        f"drawtext=fontfile=font_l.ttf:textfile=lab{i:02d}.txt:fontsize=34:fontcolor=0xf5b21a:x=80:y=h-180,"
        f"drawtext=fontfile=font_c.ttf:textfile=cap{i:02d}.txt:fontsize=31:fontcolor=0xf2ece0:line_spacing=10:x=80:y=h-128,"
        f"fade=t=in:st=0:d=0.35,fade=t=out:st={d-0.35:.2f}:d=0.35[v]")
    out=f'clip{i:02d}.mp4'
    subprocess.check_call(['ffmpeg','-y','-v','error','-i',img,'-i',f'vo{i:02d}.wav','-filter_complex',vf,'-map','[v]','-map','1:a',
        '-af',f'apad,atrim=0:{d:.2f},afade=t=in:d=0.05','-t',f'{d:.2f}','-c:v','libx264','-pix_fmt','yuv420p','-r',str(FPS),'-c:a','aac','-ar','48000','-ac','2',out])
    clips.append(out); print(i, img, round(d,1), flush=True)
open('list.txt','w').write(''.join(f"file '{c}'\n" for c in clips))
