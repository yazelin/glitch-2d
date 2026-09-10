# 格莉奇 2D

格莉奇自己的 2D 角色原型，適合半身聊天畫面。重新生成的角色部件由原生 JavaScript 組合，使用 WebGL 繪製、Web Audio 帶動嘴型，沒有 Live2D、Cubism 或 Pixi 的執行期依賴。

**[開啟新版展示頁](https://yazelin.github.io/glitch-l2d/?v=0.2.0)** · [透明舞台](https://yazelin.github.io/glitch-l2d/?overlay=1) · [先前的 Live2D 版本](https://yazelin.github.io/glitch-l2d/legacy/)

## 可以試什麼

- 平常、開心、好奇、想睡、害羞五種表情。
- 自然眨眼、呼吸、輕微歪頭、視線跟隨，以及髮束的彈性擺動。
- 播放格莉奇既有的自我介紹，或選擇本機音檔，以實際音量控制嘴巴開合。檔案只在瀏覽器播放。
- 展開 18 個部件、顯示網格、切換部件可見性，調整位置與大小。
- 下載目前的 `glitch.rig.json` 設定，供後續修改或編輯器使用。

拖動動作滑桿會關閉自然待機；調整視線滑桿也會關閉視線跟隨。按「重設」可回到預設狀態。系統設定減少動態效果時，初始待機與跟隨會關閉，仍可手動開啟。

## 目前的範圍

這是可操作的角色與動作原型。左右朝向採用小幅位移、縮放與前後部件的相對移動；歪頭範圍約六度。大角度側臉、精確音素嘴型、手指關節、完整時間軸及骨架編輯器尚未完成。肩膀與頭髮仍需要持續以動態畫面調整。

「聽她自我介紹」播放的是既有配音。這一版尚未連接 AI 模型、語音合成服務、YouTube 聊天或留言，也不會自動對外發文。嘴型使用音量判斷，無法直接區分 A、I、U、E、O。

## 圖像與設定

| 檔案 | 用途 |
| --- | --- |
| `character/glitch/rig.json` | 開放的角色設定，含畫布尺寸、父子節點、轉動中心、部件位置、UV 區域與網格密度 |
| `character/glitch/body-hair.png` | 後髮、瀏海、左右髮束、衣袖與手的圖集 |
| `character/glitch/face-base.png` | 完整下顎輪廓的無五官臉部底圖 |
| `character/glitch/face-features.png` | 眼白、虹膜、眉毛、閉眼線及嘴型圖集 |
| `character/glitch/torso.png` | 重繪的上衣、頸部與斜背帶，不含衣袖 |
| `character/glitch/design-reference.png` | 生成分件時使用的完整造型參考；不參與角色動畫 |
| `character/glitch/prompts/` | 內建 imagegen 的提示詞、裁切座標與修正紀錄 |
| `character/glitch/voice-intro.mp3` | 取自既有 `glitch-vn/docs/voice/intro-glitch.mp3` 的格莉奇配音 |

原圖參考為 `glitch-vn/art/sprite-glitch.png`。新原畫、部件和分享圖片使用內建 imagegen 生成，沒有使用 CLI 或另外呼叫圖片 API。圖片工具這次輸出 RGB，未提供真正的透明通道，因此部件採用單一綠色底；載入時以色差建立透明度並去除綠色邊緣，保留原始 PNG。造型參考圖中的棋盤格是圖片內容，沒有拿它當透明圖使用。

圖集以 UV 區域取出部件，程式沒有把眼睛或嘴巴畫成幾何替代圖案。眼睛開合會壓縮眼白網格，虹膜保留原來的形狀，再由隨開合縮小的眼眶範圍遮罩；閉到最後才接上閉眼線。髮束則依根部至髮梢的權重產生不同幅度的變形。

更換圖片時，可以沿用圖集與 UV，也可以新增單獨的 PNG，再調整 `textures`、`uv`、`rect`。原生透明 PNG 可省略 `chroma`。目前網頁下載的設定可取代 `character/glitch/rig.json`，圖片仍需保留在同一目錄。

## 程式結構

| 模組 | 工作 |
| --- | --- |
| `engine/motion.js` | 參數範圍、平滑過渡、表情、眨眼、呼吸、招呼動作與彈性運動 |
| `engine/geometry.js` | 父子節點變換、網格變形、UV 與眼眶遮罩 |
| `engine/renderer.js` | 原生 WebGL 繪製、Canvas 備援、圖集載入及分件網格顯示 |
| `engine/audio.js` | 語音播放、實際音量分析、停止與錯誤處理 |
| `studio.js` | 展示頁操作、分件位置調整、設定匯出與外部控制介面 |

執行期只使用瀏覽器功能，所有角色素材由同一網站載入。`@napi-rs/canvas` 與 Playwright 都是開發用套件，不會送到展示頁，也不需要使用者安裝。

## 之後接 AI 語音

等角色載入後，可以從同頁的控制程式操作：

```js
const glitch = await window.Glitch2D.ready;
glitch.setExpression('happy');
glitch.setIdle(true);
glitch.setParameters({ headZ: 0.2, gazeX: -0.3 });
await glitch.playAudio('/voice/reply.mp3');
// playAudio resolves when playback starts. Audio drives mouth until ended/stopped.
// Cross-origin audio must allow CORS for Web Audio analysis.
```

| 介面 | 行為 |
| --- | --- |
| `setExpression(name)` | 支援 `neutral`、`happy`、`curious`、`sleepy`、`shy` |
| `setParameters(values)` | 設定頭部、視線、眼睛、嘴巴、眉毛等參數；自動限制範圍 |
| `setIdle(boolean)`、`setFollow(boolean)` | 開關自然待機與游標跟隨 |
| `blink()`、`gesture()` | 執行短暫眨眼或招呼動作 |
| `playAudio(url)`、`stopAudio()` | 播放語音並帶動嘴型，或停止播放並閉嘴 |
| `getParameters()`、`getInfo()` | 取得目前參數與繪製狀態 |
| `exportRig()` | 取得角色設定的獨立副本 |

瀏覽器首次播放聲音通常需要使用者操作。這個介面在目前頁面內使用；透明舞台是獨立頁面，尚未提供跨視窗或 OBS 的遠端控制通道。

後續可依序接上「挑選留言、生成回覆、合成語音、播放並設定表情」。帳號授權與服務金鑰應放在本機服務或後端。專屬編輯器則可沿用同一份角色格式與引擎，逐步加入部件上傳、轉動中心、遮罩和動作關鍵格。

## 本機執行與驗證

需要 Node.js 22。單純展示可用任意靜態 HTTP 伺服器，不需打包。

```sh
npm install
npm run dev
# http://127.0.0.1:4177/
npm test
npm run build
npm run render
npm run test:runtime
```

- `npm test`：檢查參數限制、眨眼幾何、視線遮罩、音量嘴型、彈性運動、父子節點與極端參數。
- `npm run build`：檢查 JS 語法、圖集尺寸、UV、網格、網站連結與本機依賴；GitHub Pages 直接使用原始檔，不另產生打包目錄。
- `npm run render`：用相同網格產生七個狀態的透明 PNG，存入忽略提交的 `test-results/`，供檢查接縫與表情。
- `npm run test:runtime`：啟動臨時伺服器，驗證 Chromium 中的 WebGL 與 Canvas 程式介面、語音嘴型、播放停止及資源載入。首次使用若缺少 Chromium，執行 `npx playwright install chromium`。此檢查不截圖、不操作控制面板，也不代表完成手動外觀驗收。

`?renderer=canvas` 可強制使用 Canvas 備援；效能會依裝置與畫面大小而異。`?overlay=1` 隱藏操作介面，保留透明角色畫面。

GitHub Pages 延用 `main` 分支根目錄，保留 `.nojekyll`。先前的 Live2D 頁面移至 `legacy/`，其 `model/` 與 `source/` 仍在原位置；新版不會讀取這些檔案。原有 Cubism 專案與 PSD 保留。

程式碼沿用 [MIT 授權](LICENSE-CODE)。角色名稱、設計、圖像及配音的權利安排沿用原專案，不因程式碼授權而改變。
