# 格莉奇 2D

格莉奇自己的 2D 角色原型，可切換全身與聊天近景。重新生成的角色部件由原生 JavaScript 組合，使用 WebGL 繪製、Web Audio 帶動嘴型，沒有 Live2D、Cubism 或 Pixi 的執行期依賴。

**[開啟全身展示](https://yazelin.github.io/glitch-l2d/?v=0.4.2&view=full)** · [聊天近景](https://yazelin.github.io/glitch-l2d/?v=0.4.2&view=bust) · [透明舞台](https://yazelin.github.io/glitch-l2d/?overlay=1&view=bust) · [先前的 Live2D 版本](https://yazelin.github.io/glitch-l2d/legacy/)

## 0.4.2：修掉 0.4.1 留下的六個問題

以使用者匯出的 `glitch-aligned.rig (6).json` 為基準，重製兩片衣袖與兩條腿，另外用 rig 參數修正頸環與下巴。上衣與臉部原圖沒有改動。

- 畫面左側衣袖上方那條橫紋原本被咬掉一個方形缺口、還多一個勾狀凸起，重畫成與下方等寬平行的一條。
- 畫面右側手掌原本過大、手指細長分開還帶蹼感，改成手指併攏、拇指分開的小孩手，手腕接點不動。
- 大腿根收細：0.4.1 最後一次修正為了對上三視圖量到的寬度反而加粗，現在把根部改回接近直筒的細腿。
- 腿套下緣原本是一條平直硬切線、與鞋口之間留一塊空白，改成布料垂下蓋住鞋口並帶皺褶。
- 頸環與脖子：上衣被放大到 1.14 倍，頸環跟著變粗、脖子被壓掉。在 `neck.rest` 加 `shrink` 把這一段縮回頭部尺度，頸環變細也往下移，露出脖子。
- 下巴：`face` 加 `jaw` 參數，下頜微幅加寬、下緣多一點長度，不再那麼尖。

三張新素材的背景以 chroma key 切出主體後回填各自的底色，去掉生成時留下的不均勻綠底；主體像素沒有動（腿部不透明像素 778686 對 777407）。

[全身疊圖](character/glitch/proportion-check-v0.4.2.png) · [衣袖放大對照](character/glitch/sleeve-check-v0.4.2.png) · [腿與鞋底對照](character/glitch/lower-body-check-v0.4.2.png)。量到的差距記在 [prompts/release-v0.4.2.json](character/glitch/prompts/release-v0.4.2.json)：大腿根現在比三視圖取樣值細，換來的是組裝後的輪廓比較接近參考圖。

## 0.4.1：重製衣袖、直裙與腿部

以使用者最新匯出的 `glitch-aligned.rig (5).json` 為調整基礎，保留頭部、五官、髮束和上衣的微調。依正面三視圖重製兩片衣袖、百褶裙和兩條腿，再用同一套座標疊圖檢查。

- 衣袖重新校準肩膀到袖口的長度與前臂寬度；手掌在固定手腕的前提下等比調整。雙手各五指、自然無色指甲，手腕螢幕只在畫面右側。
- 裙子改為較直的百褶輪廓，減少下擺外張，保留畫面左側垂帶與不對稱圖案。
- 腿部恢復較直、較纖細的小腿線條，重新對齊鞋底高度，保留長襪、腿環、OK 繃與腿套。
- 上衣原圖保留，頸部另做局部比例修正，讓頸圈與較細的脖子露出來；外側帽 T 不跟著縮窄。
- 舊版對齊設定可以載入：更新重製部件與頸部修正，其餘保留使用者的調整。頭部對照圖也修正了底圖越過欄位、蓋住中欄的問題。

[全身疊圖](character/glitch/proportion-check-v0.4.1.png) · [衣袖放大對照](character/glitch/sleeve-check-v0.4.1.png) · [裙子、腿與鞋底對照](character/glitch/lower-body-check-v0.4.1.png)。參考圖、修改前與修改後使用同一比例；衣褶與局部輪廓仍有差異，可在小工具繼續微調。

## 0.4：自己動手對齊比例

**[開啟比例對齊小工具](https://yazelin.github.io/glitch-l2d/align/?v=0.4.2)**。三視圖的正面固定在底層，目前的 21 個角色部件疊在上面；初始角色透明度為 50%，沒有待機動作。

- 每個部件都能獨立開關，也能全開、全關或只看選取部件。閉眼線與張嘴片預設隱藏，需要時可單獨開啟。
- 點選部件後用滑鼠拖動；拖曳選取框角落可等比縮放，上方圓形把手可旋轉。右側也有位置與大小欄位、旋轉和微調按鈕。
- 可以整組調整頭部、頭髮、臉部、左右眼或雙腿。點選眼睛時，預設選取眼白、虹膜、閉眼線與眉毛整組。
- 切換全身、頭部、腰腿取景，放大至 300%，或切換原圖、疊圖與組裝。中心線、高度線與骨架參考線可分別開關。
- 方向鍵移動一個參考原圖像素，搭配 Shift 可移動十個像素；Ctrl / ⌘ Z 復原，Ctrl / ⌘ Shift Z 重做。Escape 取消正在進行的拖曳。
- 按「下載角色設定」保存 `glitch-aligned.rig.json`，之後可以用「載入設定」繼續調整，或交回專案套用。也能下載三欄對照圖。

底圖與角色共用取景和縮放，編輯只改角色部件。下載的設定記錄每片的位置、旋轉與縮放；臨時關掉的部件仍會保留。設定只在目前頁面中，重新整理會回到已發布版本，離開前請下載保存。

骨架線是跟隨部件的關節位置示意，供檢查肩、肘、腕、髖、膝、踝；目前不提供骨架拖曳或自動帶動相鄰部件。這個工具調整組裝比例，正式套用設定後仍需檢查動作接縫。

0.4.0 重製畫面左側、沒有手腕螢幕的衣袖與手，修正六指問題。當時確認為四根手指加一根拇指，指甲自然無色，並重新對齊肩膀與袖口。當時右側衣袖沿用原素材。[0.4.0 三視圖疊圖](character/glitch/proportion-check-v0.4.0.png)。

## 0.3.1：依三視圖重新對齊

這次以 `turnaround-reference.png` 的正面為全身比例基準，將參考圖與組裝結果放在相同座標，以半透明疊圖檢查。**[看三視圖、組裝結果與 50% 疊圖](character/glitch/proportion-check-v0.3.1.png)**。

- 依肩膀與袖口的位置，重新等比例放大衣袖並調整角度，修正前版手臂偏短、太往內收的組裝。
- 手掌另以手腕為固定點調整大小和方向，保持袖長；指甲仍是自然無色，手腕螢幕只在畫面右側。
- 上衣沿用原圖，重新對齊領口與下襬；裙子往上接回下襬，修正腰部與裙襬偏低的位置。
- 重製較有份量的腿部與鞋子，再等比例組裝；以鞋底固定站姿，調整大腿位置，並將隱藏的腿根延伸到裙子底下。
- 放寬後髮與兩側髮束的輪廓，瀏海保持原本高度。眼睛、眨眼與嘴型沿用上一版設定。

疊圖使用固定換算：`x = (原圖 x − 320) × 2.5 + 500`、`y = 原圖 y × 2.5 + 15`。兩張圖使用同一個取景與縮放；關閉待機、轉頭與髮束擺動後比較。三視圖中的頭部略微傾斜，分件原畫的髮束、臉部與衣褶也有差異，因此這是比例對照，並非逐像素重現。

## 可以試什麼

- 平常、開心、好奇、想睡、害羞五種表情。
- 自然眨眼、呼吸、輕微歪頭、視線跟隨，以及髮束的彈性擺動。
- 播放格莉奇既有的自我介紹，或選擇本機音檔，以實際音量控制嘴巴開合。檔案只在瀏覽器播放。
- 切換全身與聊天近景。透明舞台也會沿用選擇的取景。
- 展開 21 個部件、顯示網格、切換部件可見性，調整位置與大小；縮放預設保持比例。
- 下載目前的 `glitch.rig.json` 設定，供後續修改或編輯器使用。

拖動動作滑桿會關閉自然待機；調整視線滑桿也會關閉視線跟隨。按「重設」可回到預設狀態。系統設定減少動態效果時，初始待機與跟隨會關閉，仍可手動開啟。

## 目前的範圍

這是可操作的角色與動作原型。左右朝向使用小幅共用變形，歪頭範圍約四度。大角度側臉、精確音素嘴型、手指關節、走路動作、完整時間軸及骨架編輯器尚未完成。下半身目前是站立造型，跟隨身體的輕微待機動作。

「聽她自我介紹」播放的是既有配音。這一版尚未連接 AI 模型、語音合成服務、YouTube 聊天或留言，也不會自動對外發文。嘴型使用音量判斷，無法直接區分 A、I、U、E、O。

## 圖像與設定

| 檔案 | 用途 |
| --- | --- |
| `character/glitch/rig.json` | 開放的角色設定，含畫布尺寸、父子節點、轉動中心、部件位置、UV 區域與網格密度 |
| `character/glitch/hair-v2.png` | 瀏海、後髮與兩側髮束；各部件維持來源比例 |
| [sleeve-right-v5.png](character/glitch/sleeve-right-v5.png) | 畫面右側衣袖與併攏五指的手掌；保留手腕螢幕 |
| [sleeve-left-v5.png](character/glitch/sleeve-left-v5.png) | 畫面左側衣袖與五指手掌，兩條橫紋等寬平行 |
| [skirt-v2.png](character/glitch/skirt-v2.png) | 輪廓較直的百褶裙與畫面左側垂帶 |
| [legs-v4.png](character/glitch/legs-v4.png) | 細腿版腿部、長襪、腿套與鞋子，腿套下緣蓋住鞋口 |
| `character/glitch/face-base.png` | 完整下顎輪廓的無五官臉部底圖 |
| `character/glitch/face-features.png` | 眼白、虹膜、眉毛、閉眼線及嘴型圖集 |
| `character/glitch/torso.png` | 沿用的上衣、頸部、斜背帶與包包；原始 PNG 保留 |
| `character/glitch/design-reference.png` | 生成分件時使用的完整造型參考；不參與角色動畫 |
| `character/glitch/turnaround-reference.png` | 服裝、不對稱配件與全身比例的三視圖；不參與角色動畫 |
| `character/glitch/proportion-check-v0.4.2.png` | 正面三視圖、目前組裝與相同尺度的半透明疊圖 |
| `character/glitch/proportion-calibration.json` | 正面參考座標、衣袖對齊點與腿部來源區域 |
| [本次素材與提示詞清單](character/glitch/prompts/release-v0.4.2.json) | 內建 imagegen 的提示詞、裁切座標與修正紀錄 |
| [user-alignment-v0.4.1.json](character/glitch/calibration/user-alignment-v0.4.1.json) | 使用者提供的最後一份舊素材微調設定，供比較與還原 |
| `character/glitch/voice-intro.mp3` | 取自既有 `glitch-vn/docs/voice/intro-glitch.mp3` 的格莉奇配音 |

原圖參考為 `glitch-vn/art/sprite-glitch.png`。新原畫、部件和分享圖片使用內建 imagegen 生成，沒有使用 CLI 或另外呼叫圖片 API。圖片工具這次輸出 RGB，未提供真正的透明通道，因此部件採用單一綠色底；載入時以色差建立透明度並去除綠色邊緣，保留原始 PNG。造型參考圖中的棋盤格是圖片內容，沒有拿它當透明圖使用。

圖集以 UV 區域取出部件，程式沒有把眼睛或嘴巴畫成幾何替代圖案。眼睛開合會壓縮眼白網格，虹膜保留原來的形狀，再由隨開合縮小的眼眶範圍遮罩；閉到最後才接上閉眼線。髮束則依根部至髮梢的權重產生不同幅度的變形。

`textures.crop` 在載入時擷取來源區域，`clearRects` 排除圖集裡相鄰部件的邊角，`clearPolygons` 遮去上衣原先畫出的袖口接合洞，讓衣袖接在上衣後方。這些都是載入時的遮罩，沒有覆寫原始圖片。`rect` 使用角色座標，`uv` 使用擷取後的圖片座標；有 `lockAspect` 的部件會在驗證時檢查來源比例。前版 `body-hair.png` 仍保留，但新版不再載入。

衣袖的 `hand` 設定使用相對於部件的手腕座標，僅調整手掌區域。腿部 `attachment.depth` 與 `attachment.extend` 是部件高度的比例，控制裙子底下的遮蓋區域，縮放部件時會一起更新；膝蓋、配件與鞋底不受此延伸影響。`reference` 固定參考圖在角色座標中的位置，供離線疊圖工具使用。

更換圖片時，可以沿用圖集與 UV，也可以新增單獨的 PNG，再調整 `textures`、`uv`、`rect`。原生透明 PNG 可省略 `chroma`。目前網頁下載的設定可取代 `character/glitch/rig.json`，圖片仍需保留在同一目錄。

## 程式結構

| 模組 | 工作 |
| --- | --- |
| `engine/motion.js` | 參數範圍、平滑過渡、表情、眨眼、呼吸、招呼動作與彈性運動 |
| `engine/geometry.js` | 父子節點變換、網格變形、UV 與眼眶遮罩 |
| `engine/alignment.js` | 部件選取、整組位移、旋轉、等比縮放、復原、設定匯入與骨架參考點 |
| `engine/renderer.js` | 原生 WebGL 繪製、Canvas 備援、圖集載入及分件網格顯示 |
| `engine/audio.js` | 語音播放、實際音量分析、停止與錯誤處理 |
| `studio.js` | 展示頁操作、分件位置調整、設定匯出與外部控制介面 |
| `align/` | 使用正面三視圖底圖的比例調整小工具 |

執行期只使用瀏覽器功能，所有角色素材由同一網站載入。`@napi-rs/canvas` 與 Playwright 都是開發用套件，不會送到展示頁，也不需要使用者安裝。

## 之後接 AI 語音

等角色載入後，可以從同頁的控制程式操作：

```js
const glitch = await window.Glitch2D.ready;
glitch.setExpression('happy');
glitch.setIdle(true);
glitch.setView('bust'); // 'full' also available
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
| `setView(name)` | `full` 顯示全身，`bust` 顯示聊天近景；同步更新分享網址 |
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
npm run compare
npm run test:runtime
npm run test:alignment
```

- `npm test`：檢查參數限制、眨眼幾何、視線遮罩、音量嘴型、彈性運動、父子節點與極端參數。
- `npm run build`：檢查 JS 語法、圖集尺寸、UV、網格、網站連結與本機依賴；GitHub Pages 直接使用原始檔，不另產生打包目錄。
- `npm run render`：用相同網格產生全身、近景、眨眼、表情、轉頭及手臂擺動等十二個狀態的透明 PNG，存入忽略提交的 `test-results/`，供檢查接縫與表情。
- `npm run compare`：產生相同尺度的三欄疊圖，存入 `test-results/turnaround-alignment.png`。確認完成後，可用 `npm run compare -- --publish` 更新目前版本的公開對照圖。
- `npm run test:runtime`：啟動臨時伺服器，驗證 Chromium 中的 WebGL 與 Canvas 程式介面、語音嘴型、播放停止及資源載入。首次使用若缺少 Chromium，執行 `npx playwright install chromium`。此檢查不截圖、不操作控制面板，也不代表完成手動外觀驗收。
- `npm run test:alignment`：透過程式介面驗證小工具的載入、移動、旋轉、縮放、部件開關、骨架開關、取景、復原與設定往返；同時確認底圖位置保持固定。

比例工具匯出的 `parts[].adjustment` 是部件的額外仿射變換，套用在網格變形後、父節點變換前，眼眶遮罩也使用相同變換。原始素材、UV 與部件設定保持不變，因此匯出檔可直接供展示頁讀取。載入設定時會核對底模。已知的衣袖、裙子、腿部更新會套用新版素材及初始比例，頸部與下巴使用新版局部修正，其餘調整會保留；不相容的其他部件結構仍會拒絕載入。

`?renderer=canvas` 可強制使用 Canvas 備援；效能會依裝置與畫面大小而異。`?overlay=1` 隱藏操作介面，保留透明角色畫面。`?view=bust` 顯示聊天近景，省略時預設全身。

GitHub Pages 延用 `main` 分支根目錄，保留 `.nojekyll`。先前的 Live2D 頁面移至 `legacy/`，其 `model/` 與 `source/` 仍在原位置；新版不會讀取這些檔案。原有 Cubism 專案與 PSD 保留。

程式碼沿用 [MIT 授權](LICENSE-CODE)。角色名稱、設計、圖像及配音的權利安排沿用原專案，不因程式碼授權而改變。
