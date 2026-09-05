"""Generate portable Cubism linear keyframe motions; run from any directory.

曲線設計與 app.js 的 idle()/waveCurve() 是同一套（那邊是即時算，這邊烤成 30fps 關鍵格）。
motion3 的 idle 是固定循環，所以眨眼用固定種子預先排好一段 24 秒的「看起來隨機」序列。"""
from pathlib import Path
import json, math, random
root = Path(__file__).resolve().parents[1]
FPS = 30

def motion(name, duration, loop, tracks):
    curves = []; total = 0
    for ident, fn in tracks.items():
        samples = round(duration * FPS)
        segments = [0, round(fn(0), 6)]
        for i in range(1, samples + 1):
            t = i / FPS
            segments.extend([0, round(t, 6), round(fn(t), 6)])
        curves.append({'Target': 'Parameter', 'Id': ident, 'Segments': segments})
        total += samples
    data = {'Version': 3,
            'Meta': {'Duration': duration, 'Fps': FPS, 'Loop': loop, 'AreBeziersRestricted': True,
                     'CurveCount': len(curves), 'TotalSegmentCount': total,
                     'TotalPointCount': total + len(curves), 'UserDataCount': 0, 'TotalUserDataSize': 0},
            'Curves': curves, 'UserData': []}
    (root / 'model/motions' / f'{name}.motion3.json').write_text(json.dumps(data, separators=(',', ':')) + '\n')

# ---- 呼吸：4.5 秒，吸 40% 吐 60%，兩端各停一拍 ----
def breath(t):
    p = (t % 4.5) / 4.5
    e = lambda x: .5 - .5 * math.cos(math.pi * x)
    return e(p / .4) if p < .4 else 1 - e((p - .4) / .6)

# ---- 眨眼：閉 80ms 開 140ms；固定種子排一段 24 秒序列，18% 連眨 ----
IDLE_T = 24.0
rng = random.Random(7)
blinks = []; t = 1.8
while t < IDLE_T - .6:
    dbl = rng.random() < .18
    blinks.append((t, dbl)); t += (.5 if dbl else 0) + 2.5 + rng.random() * 3.5
def blink_at(t, lag):
    one = lambda x: 1 if x < 0 else 1 - x / .08 if x < .08 else (x - .08) / .14 if x < .22 else 1
    v = 1
    for s, dbl in blinks:
        u = t - s - lag
        v = min(v, one(u), one(u - .26) if dbl else 1)
    return v

# 24 秒循環，所以擺動的兩條正弦都取「在 24 秒內整數個週期」的頻率，接縫才不會跳
w1, w2 = 2 * math.pi * 3 / IDLE_T, 2 * math.pi * 1 / IDLE_T      # 8 秒與 24 秒週期
w3, w4 = 2 * math.pi * 2 / IDLE_T, 2 * math.pi * 4 / IDLE_T      # 12 秒與 6 秒；所有頻率都要在 24 秒內整數週期，循環才接得上
wb    = 2 * math.pi * 5 / IDLE_T                                  # 4.8 秒 ≈ 呼吸；用它讓循環對齊
def breath_loop(t):                                               # 循環版呼吸（週期 4.8 秒，5 次剛好 24 秒）
    p = (t % 4.8) / 4.8
    e = lambda x: .5 - .5 * math.cos(math.pi * x)
    return e(p / .4) if p < .4 else 1 - e((p - .4) / .6)

motion('idle', IDLE_T, True, {
    'ParamBreath':     breath_loop,
    'ParamAngleZ':     lambda t: math.sin(t * w1) * 5 + math.sin(t * w2 + 1.3) * 3 + (breath_loop(t) - .5) * 1.2,
    'ParamBodyAngleZ': lambda t: math.sin(t * w3) * 2.6 + math.sin(t * w2 + .7) * 1.4 + (breath_loop(t) - .5) * 1.6,
    'ParamWave':       lambda t: math.sin(t * w4) * 1.4 + math.sin(t * w2) * .8,
    'ParamEyeLOpen':   lambda t: blink_at(t, 0),
    'ParamEyeROpen':   lambda t: blink_at(t, .025),
})

# ---- 揮手：0–0.25s 反向蓄力，主振頻率 11，尾端衰減收 ----
WAVE_T = 2.4
def wave(u):
    if u < .25: return -6 * math.sin(math.pi * u / .25) * .5
    w = u - .25; L = WAVE_T - .25
    env = math.sin(math.pi * min(w / (L * .35), 1) / 2) if w < L * .6 else math.exp(-(w - L * .6) * 3.2)
    env *= min(1, (WAVE_T - u) / .3)                        # 最後 0.3 秒線性歸零，接回待機不跳
    return math.sin(w * 11) * 27 * env
motion('wave', WAVE_T, False, {'ParamWave': wave})

p = root / 'model/glitch.model3.json'; m = json.loads(p.read_text())
m['FileReferences']['Motions'] = {'Idle': [{'File': 'motions/idle.motion3.json', 'FadeInTime': .5, 'FadeOutTime': .5}],
                                  'Wave': [{'File': 'motions/wave.motion3.json', 'FadeInTime': .2, 'FadeOutTime': .3}]}
m['Groups'] = [{'Target': 'Parameter', 'Name': 'EyeBlink', 'Ids': ['ParamEyeLOpen', 'ParamEyeROpen']},
               {'Target': 'Parameter', 'Name': 'LipSync', 'Ids': ['ParamMouthOpenY']}]
p.write_text(json.dumps(m, indent=2) + '\n')
print('idle 眨眼時刻:', [f"{s:.1f}{'×2' if d else ''}" for s, d in blinks])
