# 下一步

## 揮手姿勢（對照 `~/ai-brain-site/images/pet-plain.webp`）

不是換骨架就好。現在的 `sleeve-left-v6.png` 是垂手畫的，把它轉上去袖口與衣褶都會倒過來。要做的是：

1. 另產一張「舉起來的袖子＋張開手掌」素材，畫風與 v6 對齊（粗橫紋、方形扣環、五指自然無色指甲）。
2. 加成可切換部件：垂手與舉手各自的 `rect`、`uv` 與 node pivot，展示頁與對齊工具都要能切。
3. 揮動用既有的 arm node 轉，不需要新的骨架數學。

## 表情

`pet-happy` / `pet-thinking` / `pet-sleep` / `pet-error` 四張的身體姿勢與 `pet-plain` 是同一組，差別只在臉。臉已經是參數化的（`tools/render.mjs` 已經有 happy、sleepy、blink 幾組），不需要另外產圖，缺的是把表情接上外部訊號。
