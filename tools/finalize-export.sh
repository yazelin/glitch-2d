#!/usr/bin/env bash
# Cubism 匯出之後的收尾：搬 runtime 檔進 model/、補回 Motions/Groups、跑測試、瀏覽器抓閉眼與張嘴驗收。
#   tools/finalize-export.sh ~/.wine-cubism/drive_c/glitch/export2
set -euo pipefail
SRC="${1:?匯出目錄}"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ls "$SRC"/*.moc3 >/dev/null
python3 - "$SRC" <<'PY'
import sys,struct; d=open(next(__import__('glob').iglob(sys.argv[1]+'/*.moc3')),'rb').read()
assert d[:4]==b'MOC3', 'moc3 檔頭不對'; assert d[4]<=5, f'moc3 version {d[4]} 太新，Core 只到 5：Export Version 要選 SDK 5.0'
print('moc3 version', d[4], 'OK')
PY
# 匯出檔名跟著 .cmo3 專案名走（例如 glitch-rig-v2.*），搬進 model/ 時一律改回 glitch.*
BASE="$(basename "$(ls "$SRC"/*.moc3 | head -1)" .moc3)"
rm -rf "$ROOT/model/glitch.2048"
cp "$SRC/$BASE.moc3" "$ROOT/model/glitch.moc3"
cp "$SRC/$BASE.cdi3.json" "$ROOT/model/glitch.cdi3.json"
cp -r "$SRC/$BASE.2048" "$ROOT/model/glitch.2048"
python3 - "$SRC/$BASE.model3.json" "$ROOT/model/glitch.model3.json" "$BASE" <<'PYX'
import json,sys; src,dst,base=sys.argv[1:]
m=json.load(open(src)); fr=m['FileReferences']
fr['Moc']='glitch.moc3'; fr['DisplayInfo']='glitch.cdi3.json'
fr['Textures']=[t.replace(base+'.2048','glitch.2048') for t in fr['Textures']]
json.dump(m,open(dst,'w'),indent=2); print('model3.json 引用改回 glitch.*，來源檔名', base)
PYX
python3 "$ROOT/tools/build-motions.py" >/dev/null          # 匯出會覆蓋 model3.json，把 Motions/Groups 補回來
python3 -c "import json;m=json.load(open('$ROOT/model/glitch.model3.json'));assert 'Motions' in m['FileReferences'] and m.get('Groups'),'Motions/Groups 沒補回';print('model3.json Motions/Groups OK')"
cd "$ROOT" && npm test >/dev/null && echo "npm test OK"
python3 -c "import json;r=json.load(open('test-results/rig-verification.json'));assert r['errors']==[];print('params 有效果', sum(1 for x in r['results'] if x['vertexDelta']>1e-6 or x['opacityDelta']>.5), '/', len(r['results']))"
