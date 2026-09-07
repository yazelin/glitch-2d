# GLITCH · 格莉奇 Live2D

以提供的角色原圖製作的 Cubism SDK 5.0 相容基礎模型，附互動展示頁與可編輯來源。

[開啟展示頁](https://yazelin.github.io/glitch-l2d/)

## 已完成的動作

| 參數 | 動作 | 模型內的實作 |
| --- | --- | --- |
| `ParamAngleZ` | 頭部傾斜 | `D_Head` 旋轉變形器 |
| `ParamBodyAngleZ` | 身體擺動 | `D_Body` 旋轉變形器 |
| `ParamBreath` | 呼吸 | `D_Breath` 控制上衣縮放 |
| `ParamWave` | 揮手 | `D_ArmWave` 控制手掌與袖子 |
| `ParamEyeLOpen` / `ParamEyeROpen` | 左右眨眼 | 眼皮透明度 |
| `ParamMouthOpenY` | 開口 | 開口素材透明度 |

模型有 30 個 ArtMesh、4 個旋轉變形器、28 個參數。其餘標準參數尚未綁定，不代表都能驅動動作。這一版不包含臉部 XY 轉向、視線移動、髮絲物理或手指關節。

網頁只改變模型參數，由 Cubism Core 計算網格變形。網格檢視可直接查看三角形結構。待機與揮手另附 `.motion3.json`，可供其他 Cubism 播放器使用。

### 待機與揮手的節奏

`app.js` 的 `idle()`／`waveCurve()` 與 `tools/build-motions.py` 是同一套設計，一邊即時算、一邊烤成 30fps 關鍵格：

- 眨眼：閉 80ms、開 140ms，間隔 2.5 到 6 秒隨機，18% 連眨兩下，右眼比左眼慢 25ms。motion3 是固定循環，所以用固定種子預排一段 24 秒序列。
- 呼吸：4.5 秒一循環，吸 40%、吐 60%，頭與身體的擺動各帶一點呼吸的分量。motion3 版用 4.8 秒，五次剛好接回 24 秒的循環。
- 擺動：每個參數疊兩條頻率不可公度的正弦，看不出循環；motion3 版所有頻率都取 24 秒內整數週期，六條曲線首尾差為 0。
- 揮手：前 0.25 秒反向蓄力，主振頻率 11，尾端衰減，最後 0.3 秒線性歸零接回待機。

驗法：對本機頁面取樣 40 秒（`ParamEyeLOpen`、`ParamBreath`），實測 12 次眨眼、間隔 2.7 到 5.9 秒、連眨 2 次、呼吸週期 4.50 秒。

## 檔案

- `model/glitch.model3.json`：SDK 載入入口；使用時保留整個 `model/` 目錄結構。
- `model/glitch.moc3`：以 Editor 的「For SDK 5.0 / Cubism5.0」匯出。
- `source/glitch.cmo3`：可繼續修改綁定的 Cubism 專案。
- `source/glitch.psd`：原始 34 層素材，畫布 1196 × 3072。模型移除了 I、U、E、O 四個測試嘴形。
- `pet-plain.webp`：提供的原圖，598 × 1536。
- [換圖規格](source/REPLACE-ART.md)：交給之後精修素材的人。

## 本機執行

```sh
python3 -m http.server 8766
```

開啟 `http://localhost:8766`。展示頁需連網載入 Cubism Core、PixiJS 與 pixi-live2d-display。使用 PixiJS 6.5.10、pixi-live2d-display 0.4.0；後者的 `cubism4` 檔名是其套件命名，實際 Core 已驗證可載入本模型的 SDK 5.0 格式。

## 驗證

```sh
npm install
npm run test
```

測試會啟動本機伺服器，以 Chromium 載入實際模型，比較各參數極值的網格頂點或透明度，並檢查滑桿、待機、揮手、網格顯示與手機版。首次使用 Playwright 需執行 `npx playwright install chromium`。

## 素材品質與換圖

目前是可動作的基礎版本。原始分層中的臉底與遮擋處是簡單補色。閉眼（`22_lid_R`、`23_lid_L`）與開口（`42_mouth_A`）已換成沿原畫風重做的素材並重匯進模型（來源與做法在 `glitch-vn/art/live2d/refine/`）。

重匯時不必重生網格的做法：Cubism 的 Auto Mesh 對話框在 Wine 下按鈕搆不到，所以把新開口素材**以唇線為中心往下移**、裁到舊網格範圍內（Cubism 預設 boundary margin 20px），再用 File → Open PSD → `Model settings` 選已開啟的模型 → `Re-import settings` 選 `Replace [舊 PSD]`。圖層靠名字對回 ArtMesh；模型沒有的四張嘴形不會被加進來，重排圖集時會問要不要刪掉它們的舊圖，答 Yes。

切錯位置的兩處修正（2026-09-07）：後髮層底部原本含帽T 的肩膀與帽子滾邊（頭一轉帽T 跟著動），指尖被切層腳本當小碎片丟進粒子層（手一揮指尖留在原地）。
修法在 `glitch-vn/art/live2d/refine/head_mask.py`（沿髮絲與衣服交界手描折線，線下像素一律搬出頭部層——用顏色分不開同色系的髮與帽T）與 `fix_head_hands.py`（指尖），用 `refine/rebuild_all.sh` 從原圖重跑整條修補管線後 Replace 重匯。

滑桿範圍是 rig 的極限，不是保守：這一版沒有脖子與肩膀的變形器，`D_Head`、`D_ArmWave` 都是單一剛體旋轉，
頭超過 ±12°、揮手超過 ±14° 就會露出切口（後髮蓋上領口、袖子上緣離開肩膀）。要開到 ±30° 得在 Cubism 加脖子與肩膀的變形器。

揮手切到身體的修法（2026-09-07）：舉手那隻袖子原本有 49% 疊在軀幹上，`D_ArmWave` 一轉整塊跟著走。
`glitch-vn/art/live2d/refine/split_sleeve.py` 把肩縫右側的袖子像素搬進帽T（直通 alpha over 合成，休息姿態不變），
袖子網格只剩手臂本體；揮手幅度同時從 ±27° 降到 ±14°。上下臂仍是同一個旋轉，要分開得在 Cubism 加手肘軸的旋轉變形器。

匯出的檔名跟著 `.cmo3` 專案名走（`glitch-rig-v2.*`），`tools/finalize-export.sh <匯出目錄>` 會改回 `glitch.*`、修 model3.json 的引用、補回 Motions／Groups、跑測試。

可沿用本專案更換精修原畫，優先保持畫布、姿勢、分層名稱與順序。輪廓、比例或部位位置改動較大時，需調整網格和關鍵姿勢。替換完成後重新整理貼圖集，並重新匯出整套模型。

參考：[Live2D PSD 重新匯入說明](https://docs.live2d.com/en/cubism-editor-manual/psd-re-import/)、[模型範本說明](https://docs.live2d.com/en/cubism-editor-manual/template/)。本版直接建立變形器，未套用外部模型範本。

## 來源與授權

角色素材來自本次提供的圖片及既有 `glitch-vn` 分層專案；本 repo 不另行授予角色美術素材的使用權。網站程式碼採 MIT 授權，見 `LICENSE-CODE`。

Live2D Cubism Core © Live2D Inc.，由官方網址載入，使用依其授權條款。PixiJS 與 pixi-live2d-display 為 MIT 授權的第三方程式庫。
