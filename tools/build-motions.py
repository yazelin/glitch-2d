"""Generate portable Cubism linear keyframe motions; run from any directory."""
from pathlib import Path
import json, math
root=Path(__file__).resolve().parents[1]
def motion(name,duration,loop,tracks):
    curves=[]; total=0
    for ident,fn in tracks.items():
        samples=round(duration*30)
        segments=[0,round(fn(0),6)]
        for i in range(1,samples+1):
            t=i/30
            segments.extend([0,round(t,6),round(fn(t),6)])
        curves.append({'Target':'Parameter','Id':ident,'Segments':segments})
        total+=samples
    data={'Version':3,'Meta':{'Duration':duration,'Fps':30,'Loop':loop,'AreBeziersRestricted':True,'CurveCount':len(curves),'TotalSegmentCount':total,'TotalPointCount':total+len(curves),'UserDataCount':0,'TotalUserDataSize':0},'Curves':curves,'UserData':[]}
    (root/'model/motions'/f'{name}.motion3.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
def blink(t):
    p=t%4
    return 1 if p<3.6 or p>3.92 else abs(p-3.76)/.16
motion('idle',8,True,{'ParamBreath':lambda t:(1-math.cos(t*math.pi/2))/2,'ParamBodyAngleZ':lambda t:4*math.sin(t*math.pi/4),'ParamAngleZ':lambda t:8*math.sin(t*math.pi/4),'ParamEyeLOpen':blink,'ParamEyeROpen':blink})
motion('wave',2.4,False,{'ParamWave':lambda t:27*math.sin(t*math.pi*5)*math.sin(t*math.pi/2.4)})
p=root/'model/glitch.model3.json'; m=json.loads(p.read_text())
m['FileReferences']['Motions']={'Idle':[{'File':'motions/idle.motion3.json','FadeInTime':.5,'FadeOutTime':.5}],'Wave':[{'File':'motions/wave.motion3.json','FadeInTime':.2,'FadeOutTime':.3}]}
m['Groups']=[{'Target':'Parameter','Name':'EyeBlink','Ids':['ParamEyeLOpen','ParamEyeROpen']},{'Target':'Parameter','Name':'LipSync','Ids':['ParamMouthOpenY']}]
p.write_text(json.dumps(m,indent=2)+'\n')
