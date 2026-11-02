# Somerville handoff（Cursor → Codex，2026-11-02）

工作目錄是 `/Users/taichengwong/Projects/RopeGeometry`（計畫寫的 `RopeGeometry2` 沒有任何 Somerville 新檔，不要切過去）。未 commit、未 push、未新增 npm 依賴。`npm test` 82/82、`npm run build` 通過。

## 一句話現況

- **里程碑 1（完整鬆結）完成並驗證**：`data/somerville-final/loose.json` 在實際顯示網格上零自交、零折疊、零穿柱，七項操作檢查全過，`somerville.html` 實際載入可旋轉。
- **里程碑 2（收緊＋影片姿態）未完成**：`data/somerville-final/final.json` 是 **FAIL 候選**（`acceptance.status: "FAIL"`），不能當交付。真正的阻礙是**鎖結核心太大、太偏右**，而且 PBD 無法在保持有效管體的前提下把它壓小。下一步應回到生成器處理核心路由（需要 Codex 做來源判斷），見最後一節。

## 1. 鬆結修正（`src/somerville-build.js`）

Codex 最後的 `cuffExitX`／`spread` 掃描永遠失敗，根因不是參數：

1. **拉普拉斯平滑在固定點留尖角**（cuff 出口 3.4 mm 折角）→ 改成雙調和平滑，cuff 兩端各固定兩個取樣保持切向連續。舊法保留為 `fairing:'laplacian'`。
2. **雙股帶側向彎曲**：cuff 底部朝後離開、U 形折回前方鎖環，側向量（柱軸 X）在彎曲平面內，脊線半徑 6.9 mm < 半寬 5 mm + 繩半徑 3 mm → 新增 `edgeGuardRadius`（12 mm）：脊線急彎處加束轉角錨點，把側向量導向副法線（兩股改成跨彎曲面疊放）。cuff、under-cuff 附近與 bight 不加。
3. 預設 `cuffExitX` 1.4 → 1（1.4 時 `cuff-to-first` 撞 `return-approach`）。
4. 輸出新增 `somerville.rollAnchors`（`spineIndex`、`materialArc`、`roll`、`source`）記錄束轉角。

鬆結數字：管面自交 0、折疊 0、穿柱 0；非局部最小間隙 3.99 mm；繩柱 4.49 mm（中心線）。重現：`node scripts/generate-somerville.js`；診斷：`node work/somerville/diag/tube-diag.mjs '{}'`。

## 2. 參數延拓與具名預設

`work/somerville/diag/march.mjs <from.json> <to.json> [minGap] [out.json]`：兩組參數間自適應前進，每步都要通過 seed 間隙 ≥ 0.2 mm、繩柱間隙、七項操作、實際管體檢查，失敗減半。`chain.sh` 串接多階段。

新增參數（預設值下鬆結幾何不變，已比對）：`underLift`（下穿 cuff 層距，原寫死 10.2 mm）、`outside-cuff` 遠端維持 `max(underLift,1.7d)` 層距、`rootDrop`（原寫死 4 倍環半徑）。

`SOMERVILLE_PRESETS`（`src/somerville-build.js`）：

| 預設 | 內容 | 驗證 |
| --- | --- | --- |
| `tightCuff` | cuff 半徑 = 柱 + 3.5 mm（前方下穿處 +6.6 mm）、四股寬 26.5 mm、雙股間距 6.5 mm、鎖環半徑 27.8 mm、核心距柱前 66 mm | 管體、操作全過；最小間隙 0.29 mm |
| `poseSeed` | `tightCuff` + bight 長度/斜率對齊影片（`bightReach` 0.10、`bightSlope` 0.53、`foldRadius` 11 mm）、`outerReach` 6.4 mm、`rootDrop` 1.5、`returnDepth` 1.4 | 全過 |

**卡住處（需要 Codex 決策）**：核心再往 cuff 前下方推（影片核心約在 x≈0、z≈−26 mm），`cuff-to-first`（從 cuff 出口 x≈W 往左橫掃到 firstX）必然越過 `return-approach` 上升到 secondX 的段，兩者都在鎖環背面。已試且無效：`returnDepth`、`passBack`、`cuffExitX`；`firstApproachMode=1`（從柱下繞左）改撞 `loop-to-cuff`。**未試**：交換 firstX/secondX（第二次穿環放左側）——會改變 bight 離開核心時與 over-root 的前方交叉，屬於來源未支持的拓樸選擇，請先核對 100–124 秒影格。

## 3. PBD 收緊器（`src/somerville-relax.js`）

純 JS。約束：固定段長（`restLengths`）、最小彎曲半徑 4.2 mm 弦長約束＋輕平滑、非局部繩間距（空間網格；以**目前**中心線弧長排除 < 4d 的局部鄰域）、繩柱間距、x/z 形狀目標。

**穿越保護（已證明＋已測）**：每步先嘗試完整位移；對每個鄰近線段對沿線性軌跡取樣，樣本距離減去 Lipschitz 餘量 (da+db)/(2m) 仍 ≥ 硬下限（d + gap/2）才算通過；不通過的端點步長減半，三輪後改用保守限步（位移 ≤（距離 − 下限）/2），並反覆重檢直到無違規；最後仍有終點回退檢查。實測回退 0。測試 `test/somerville-relax.test.js`：強目標無法把一股壓穿另一股（停在 6.29 mm；繩徑改 0.5 mm 時停在 0.6 mm，確認測試非空洞）、無負載直繩段長與位置不變。

**已知漏洞**：局部鄰域排除仍是求解加速用的假設；當段長在求解中改變（材料輸送），原本局部的線段對可能在重疊狀態下轉為非局部。最終仍以 `checkTube` 為準。

## 4. 姿態對應與完整流程

- `src/somerville-pose-targets.js`：`POSE_CORRESPONDENCE`（建模假設：cuff 四股依前方 z=0 交點 x 排序；長端由 x 排序；bight 依材料順序 上腿→摺彎→下腿）、`correspondenceSpans`（材料弧長區段）、`poseTargets`、`slidingTargets`（最近點，可沿標註線滑動）、`windowSpans`（評分時依影像視窗重定區段）、`unexplainedVisible`（畫面內、非對應區段、不在鎖結框/cuff/柱後方、且距所有標註 > 1 繩徑的點）。
- `scripts/solve-somerville-pose.js`：固定參數與順序；`poseSeed` → 16 批 × 100 次（cuff 材料弧長目標、長端/bight 滑動目標、核心弱 3D 吸引、自由端持續下拉、核心區段每批縮短 4% 段長並把等量長度加到**畫面外**長端段）→ 拋光 → 自由端長度校正 → 重算材料弧長 → 擬合相機、評分、全部檢查。輸出 `final.json`、`reports/somerville-final-report.json`、`reports/somerville-final-timing.json`（約 116 秒）。

### 目前結果（FAIL）

| 檢查 | 結果 |
| --- | --- |
| 操作七項 | PASS |
| 正間隙 | PASS（最小 0.08 mm，目標 0.2 mm） |
| 可見中心線 | FAIL：整體 14.6 px，但 bight 下腿 32.9 px（> 30），摺彎 23.6 px；cuff 4–6 px、長端 7–8 px |
| 未標註可見點 | 314（`return-approach` 161、`outside-cuff` 79、`loop-rim` 35…） |
| 管體 | FAIL：4082 自交、1251 折疊面，遍布被縮短的核心區段（段長縮到 0.8 mm 後擠成急彎） |
| 材料長度 | +56 mm 殘差（縮短的段沒跟上，自由端校正因超過末段長而跳過） |

對照：「僅姿態目標」候選（`work/somerville/diag/pose-try.mjs work/somerville/diag/p-bight.json 800`）可見中心線 RMS 3.3 px、管體與操作全過，但**有 904 個未標註可見點**、長度 −26 mm，所以低 RMS 是誤導；這也是為何加了 `unexplainedVisible`。

疊圖：`work/somerville/diag/overlay-v6.png`（目前流程）、`overlay-v2.png`…`v5.png`（演進）。產生：`python3 work/somerville/diag/overlay.py <final.json> <out.png>`。

### 判斷

核心的多餘材料（`return-approach` 在長端後方下垂的 U、`over-root`/`outside-cuff` 環住 bight 腿根部的 U）拓樸上都可以滑回核心，但 PBD 沿 2500 點鏈傳遞張力太慢，而「縮短靜止段長」雖能局部收縮，卻製造不受保護的急彎。依規格「停滯時回到區段生成參數重新求解」：**應該先讓生成器直接產生緊湊核心**（第 2 節的路由決策），PBD 只做小幅收緊與姿態微調——第 3 節的求解器在小幅調整時表現很好（僅姿態實驗零回退、管體有效）。

## 5. 建議順序

1. Codex 核對 100–124 秒影格，決定 firstX/secondX 左右與 `cuff-to-first` 的路由（從 return 上升段前方或後方越過），改生成器使核心在 x −15…+20 mm、z −13…−43 mm 內，`return-approach`／`outside-cuff` 不外露。用 `march.mjs` 驗證每一步。
2. 求解器：把彎曲限制納入步長接受條件（拒絕產生 < 繩半徑彎曲的步），或改以重新取樣輸送材料而非縮短段長；收緊目標 0.2 mm 間隙。
3. 自由端長度校正需處理「超過末段長」：沿畫面外長端重新分配點位。
4. `somerville.html` 的 final 選項仍停用；最終姿態通過後再啟用，並補正/背/側視截圖、並排與疊圖。可重現性已確認：目前 `solve-somerville-pose.js` 同輸入連跑兩次，`final.json`（`947112d3…`）與報告（`92973033…`）SHA-1 完全相同；執行時間只寫在 timing 檔。
5. 標註沒有任何 crossing 目標，`crossingPose` 一直是 UNVERIFIED；規格要求的「可辨識交叉位置誤差 ≤ 1 繩徑」需要 Codex 補標。

## 6. 檔案清單（本次新增/修改）

- 修改：`src/somerville-build.js`（雙調和平滑、側彎保護、`underLift`、`rootDrop`、`SOMERVILLE_PRESETS`、`rollAnchors`）、`data/somerville-final/loose.json`（重建）
- 新增：`src/somerville-relax.js`、`src/somerville-pose-targets.js`、`scripts/solve-somerville-pose.js`、`test/somerville-relax.test.js`、`data/somerville-final/final.json`（FAIL 候選）、`reports/somerville-final-report.json`、`reports/somerville-final-timing.json`、`work/somerville/diag/*`（診斷腳本、延拓結果 `p-*.json`、疊圖）
- 未動：`src/somerville-verify.js`、`src/rope-tube.js`、`src/somerville-pose-fit.js`、`somerville.html`、`src/somerville-viewer.js`
- 背景：開發伺服器曾在 `http://127.0.0.1:5199/somerville.html`。
