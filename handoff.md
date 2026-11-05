# Somerville handoff（目前接手狀態：Codex，2026-11-02）

## 現況索引（2026-11-05）

下面的段落按時間倒序，含多代互相矛盾的數字。接手只需先看這一段。

- 現行交付：`data/somerville-final/loose-v3.json`（dressed 靜態種子，SHA-256 `ea7676ee…`，點位 `3db0782f…`）。重現：`npm run generate:dressed`。它是靜態種子，不是影片姿態完成模型。
- 現行報告：`reports/somerville-dressed-seed.json`（種子閘門、`tube.radialSweep`、網格試驗）與 `reports/somerville-dressed-report.json`（姿態評估：static FAIL、motion UNVERIFIED）。
- 現行生成器：`src/somerville-dressed.js`（`buildSomerville({route:'dressed'})`）、`scripts/generate-somerville-dressed.js`、`scripts/dressed-pipeline.js`、`scripts/evaluate-somerville-dressed.js`。
- 歷史、不代表現況：`data/somerville-final/final.json`、`continuation*.json`、`videoTight-history*`、`loose.json`、`loose-v2.json`；`reports/somerville-final-report.json`；Phase 5 recovery 的 74 對穿透；README 內 Phase 1–5 段落。
- 人工判斷待辦：`data/somerville-pose148.json` 兩個接觸的 `over.role`／`under.role`／`bindingStatus` 仍為 `unverified`，由審核者看影格後填寫，程式不預填。
- pipeline exit code：0 = 種子凍結（姿態可仍 FAIL／UNVERIFIED）；2 = 種子未凍結；1 = 執行錯誤。目前 exit 0；評估器單獨執行時 static ≠ PASS 回 2。

## 2026-11-05 管體檢查器假陽性修正（Cursor）

Codex 上一段記錄的 8/16/24 徑向分段自交（1／62／177，全在筆直尾端）是 `src/rope-tube.js` `triangleIntersection` 的假陽性，不是 loose-v3 的幾何問題。以傾斜直管（`[0.6,0.5,0.6]·11 mm·i`，120 點，r = 3 mm）重現：修正前 12/16/24 分段 0／31／28 自交，軸對齊直管全為 0。

觸發分支是邊穿越平面的判定，不是共面分支也不是 `legitimate()`：相鄰共一頂點的兩個三角形中，一條沿管體母線的邊在對方平面上的兩端距離分別是 −2.7e-20 與 +3.5e-17 m（都遠小於 epsilon 1e-6），`ds[i]*ds[j]<0` 仍被當成穿越，合成的交點距共用頂點約 8.6 µm（超過 `legitimate` 的 2 µm），且因三角形在該頂點的夾角只有約 6°，交點落在對方邊線 0.9 µm 內、被 `inside` 容差接受。修正：只有兩端都在平面外超過 epsilon 的邊才算穿越；端點在 epsilon 內的已由同一迴圈的「頂點在平面上」分支處理。遠端三角形判定沒有放寬。

回歸：`test/rope-tube.test.js` 新增傾斜直管 8/12/16/24/32 分段均 0 自交、0 折疊，以及一對合成三角形（共頂點、沿母線延伸的邊不算穿越；真正穿過平面的邊仍算）。兩個新測試對修正前的檢查器都失敗；既有負控（緊彎失敗、遠端交叉偵測、超出共邊的重疊被拒、柱體內部）維持通過。`npm test` 122/122。

loose-v3 重跑 8/12/16/24 分段：自交／折疊／穿柱全部 0／0／0，管面最小柱間隙 1.866／1.701／1.658／1.672 mm。`reports/somerville-dressed-seed.json` 新增 `tube.radialSweep`（8/16/24，標明只是資訊、閘門仍是 12 分段）。

副作用與處置：檢查器修正後，網格候選 `{rootDepth 0.104, rimPitch −0.016}` 在 12 分段也通過全部閘門且非局部間隙 0.487 mm 較大，若沿用「全過者取間隙最大」會把 loose-v3 換成另一組點位（點位 SHA `030a1139…`）。已改為固定 preset 全過即為交付、網格只作救援搜尋（報告 `selectionPolicy`、`gridBest`），loose-v3 與點位 SHA 不變（`ea7676ee…`、`3db0782f…`）。種子報告 SHA 因新增欄位而改變（`5d36fda9…`）。

## 2026-11-05 dressed 靜態種子：已按固定閘門凍結 loose-v3

`npm run generate:dressed` 現在先產生種子、再執行獨立姿態評估。種子階段通過並寫出 `data/somerville-final/loose-v3.json`；姿態仍是 FAIL、運動仍是 UNVERIFIED，不能把 loose-v3 稱為影片完成模型。

固定 `dressedTight`、6 mm 繩徑、3 mm 管半徑、12 徑向分段的結果：

| 檢查 | 本輪起點 | loose-v3 |
| --- | ---: | ---: |
| 非局部中心線穿透 | 24 對 | 0 對 |
| 最小非局部表面間隙 | −1.077 mm | +0.317 mm |
| 管面自交／折疊／穿柱 | 977／335／0 | 0／0／0 |
| 管面最小柱間隙 | +2.139 mm | +1.701 mm |
| 最終操作 | PASS | PASS（九項全過） |
| 總長 | 7.138936637394829 m | 7.138936637394829 m，殘差 0 |

幾何修正包括：`over-root` 改為單向掃過兩個根部並以局部孔徑 X 單調測試鎖定；尾端、under-approach、return-approach 使用可驗證圓角；高曲率接頭只在 12 mm 鄰域內做局部平滑；bundle roll 依脊線弧長插值並在同一鄰域低通；股距由 7.2 mm 增至 8.5 mm。`tailStep` 11 mm 只控制畫面外直線自由尾端的取樣，不改路由或材料總長。

第一次與第二次完整 pipeline 的三個 SHA-256 均一致：

- `dressed-candidate.json` / `loose-v3.json`: `ea7676ee9fbebbc537fe5a7d097f5b53f20c48c968659f8f3fb12a7ceabf85f7`
- 點位 JSON：`3db0782f4c0edbe4e6f3b4df30b5e14a22976d47d464c676e505bf57c8b33f59`
- `somerville-dressed-seed.json`: `20fdd13ca637e15eda4b7e4d2e0e2f1b350bb7012f078c63404a26bed2925e72`

獨立重算確認候選、種子報告與姿態報告引用同一幾何。`npm test` 120/120 通過，`npm run build` 通過。基準與最後逐段診斷分別在 `work/somerville/dressed/join-baseline.json` 和 `join-final.json`。本輪按 AGENTS 政策先呼叫 Cursor CLI / grok-4.7-high；Cursor 寫出診斷工具與基準後連線中斷，重連未恢復，Codex 接手修正並獨立驗證。未 commit、未 push。

已知邊界：固定的 12 邊實際顯示網格通過。改用 8、16、24 徑向分段時，現有 triangle checker 分別在完全筆直的自由尾端回報 1、62、177 個同股局部交點，沒有核心角色或柱體交點。這表示本次凍結符合既定靜態閘門，尚未構成取樣無關的連續管體證明。下一階段若需要提高該證明強度，應先處理局部相鄰三角形的數值判定或改用解析 swept-tube 檢查。

姿態評估結果保持誠實分離：`staticReconstruction: FAIL`，`motionContinuity: UNVERIFIED`，固定尺度最佳殘差約 109.44 px。148 秒輪廓、已審核 crossing 綁定、PBD/march 與連續運動仍屬後續工作。

## 2026-11-04 dressed 靜態種子：未凍結

`loose-v3` 沒有寫出。命名候選仍是 `data/somerville-final/dressed-candidate.json`。重現：`npm run generate:dressed`（先種子、再姿態評估）。exit 0 才是種子已凍結；exit 2 是種子未凍結、姿態可以仍為 UNVERIFIED；exit 1 才是執行錯誤。本輪 exit 2。

固定 `dressedTight`、管體半徑 3 mm、12 徑向分段：

| | 修正前（正確半徑） | 本輪 |
| --- | --- | --- |
| 中心線穿透 | 39（over-root/1 自交 22、loop-to-cuff 雙股 12、over-root 雙股 5） | 24（loop-to-cuff/0\|1 12、over-root/0\|1 12） |
| 最近對 | over-root/1 自交，間隙 −2.777 mm | over-root/0 段 859 與 over-root/1 段 1565，間隙 −1.077 mm |
| 管體 | 自交 1,099、折疊 409、穿柱 0、柱間隙 +1.116 mm | 自交 977、折疊 335、穿柱 0、柱間隙 +2.139 mm |
| 最終操作 | PASS | PASS |

先前報告裡的 16,620 自交和 2,001 穿柱是把直徑當成半徑。`dressedTube` 現在固定傳 `diameter/2`，截面頂點到軸線的距離由測試鎖在 3 mm。

留下的兩組都過了材料排除（中心距約 4.9 mm，門檻 6.2 mm）。over-root 同肢髮夾已不在群組裡；掃過兩個根部的那一段在孔徑局部 X 單調，`overRootBranches` 仍 PASS。把 loop-to-cuff 滑移段的側向量改成徑向後，該組從 12 對增到 45 對，已退回。把尾端根部支臂和穿環彎道加長到能放 12 mm 圓角後，新出現 cuff-to-first 與 tail 的穿透，也已退回。under-approach 與 return-approach 的圓角有留下：中心線對數沒有再增加，管體自交和折疊比正確半徑的起點少。網格沒有挑出另一組參數；`selectedOptions` 是空的，與固定 preset 相同。

兩個外框都不是通過條件。`allNonTail`（含 cuff 與 bight）137 × 187 mm。`lockingCore`（loop-rim、first-passage、over-root、return-passage、bight-leg、fold；角色集合是建模選擇）54 × 106 mm。影片 34 × 28 mm 只框可見結心，不能拿來和這兩個框相減。

姿態評估仍是 static FAIL、motion UNVERIFIED。這不是種子凍結。

## 2026-11-03 dressed 實作進行中（本輪）

- 本輪先做完整 dressed 靜態模型，靜態未通過前不啟動 march；舊 loose-v2 / final 不代表新的交付。
- 新來源帳本：`docs/somerville-dressed-core-ledger.md`。已抽取 TheDuchy 118–149 s 每 0.25 s、Topologist 160–200 s 每 1 s；實際檢視範圍、人工像素量測及未確定股線寫在帳本。影格及精確選取時間在 `work/somerville/frames/dressed-frame-manifest.json`。
- 已加入 `data/somerville-pose148.json` 尺度校準 4250–5750 px/m、核心觀察與兩個可見接觸位置；兩個接觸的材料綁定仍 UNVERIFIED，不能據此宣稱 crossingPose PASS。
- 實作前重跑現有測試：100/100 通過，記錄 `work/somerville/dressed/baseline-tests.log`。
- 已啟動兩個指定 Cursor CLI / grok-4.7-high 工作：生成器/操作驗證，以及姿態/驗收/檢視器，分開檔案所有權。執行紀錄 `work/somerville/dressed/cursor-implementation.log` 與 `cursor-pose.log`。本段是進行中紀錄，結束後須以實際結果補記，不可把啟動當完成。

## 最新：共用核心、固定材料與守長試跑（優先閱讀）

2026-11-03 續查：`npm test`、`npm run build` 通過；最新 `reports/somerville-final-report.json` 仍為 **FAIL**。材料參考長 7.138936637394829 m，總長殘差約 `2.66e-15 m`；幾何、材料及正間隙通過，最終操作、影片輪廓、交叉位置、未解釋可見繩路與完整運動未通過。`final.json` 仍是候選，勿標成完成。

**整個任務仍未完成。** 已抽取並測試共用核心；Somerville 最終 148 秒姿態、核心來源對應與完整掃掠管面連續碰撞仍未通過。下面 Cursor 的 `videoTight` 數字屬於歷史候選，不能再當成目前 `final.json` 的數字。

### 本輪完成與保留

- 工作只在 `/Users/taichengwong/Projects/RopeGeometry`。未新增 npm 依賴、未 commit／push。此工作樹接手時已有大量變更，請保留。
- 按政策呼叫 Cursor CLI／`grok-4.7-high`，等候期間沒有輸出或檔案變更，已中止該次程序並向使用者說明，後續由 Codex 實作。
- `src/rope-frames.js` 合併框架傳輸；Somerville 生成器和管體都使用它。抽取前後的完整中心線、雙股框架及管體 JSON hash 完全一致。
- `src/rope-state.js` 分開固定材料座標 `s0` 與目前 `geometryArc`，提供材料取樣、重新取樣、殘差與剛體座標轉換。
- `src/rope-curves.js` 提供共用曲線與最小配方編譯。Somerville 已共用 Hermite 與框架；**Somerville 的操作規格還沒有完全編譯成配方**。不要宣稱通用操作編譯器已完成。
- `src/rope-relax.js` 是共用求解器；`src/somerville-relax.js` 只保留相容匯出。距離計算改用既有穩健核心。`src/rope-lengths.js` 以三對角聯立投影維持全鏈段長，修正逐點縮步破壞投影結果的問題。
- 最終位移在彎曲調整後重新做非局部中心線／柱體連續檢查；可加 `surfaceGuard` 檢查提案終點的真實管面折疊。**這仍不是完整掃掠管面的連續認證**。
- `src/rope-targets.js` 只生成同一材料站位的目標：目標本體釋出的長度加到自由尾端，不能用目標取代目前材料狀態。
- `src/rope-acceptance.js` 要求交叉位置、0.2 mm 間隙、總長／段長各 1 µm、材料來源及運動檢查。缺失項不會 PASS。
- 影像視窗不再按投影位置排序或拼接不連續材料；未解釋可見繩路不再整段略過 cuff。失敗候選在檢視器中明確標為候選。

### 目前模型與數字

- 凍結基準 `data/somerville-final/loose-v2.json`，SHA-256：`60c3548a7feb7c8d8f3b9bba74ecc29134baf35c937aee019884c1c726ccd601`；材料總長 **7.138936637394829 m**。不要改寫它作為新基準。
- `node scripts/continue-somerville.js 8 20` 從該基準實際移動，產生 `continuation.json` 與 `reports/somerville-continuation.json`。
- 試跑保留八批有效提案，但**不表示到達八個目標構型**。全程最大點位移只有約 **3.119 mm**，核心仍很鬆。完整管體零自交、零折疊、零穿柱；中心線非局部間隙約 **3.538 mm**；總長殘差約 `2.66e-15 m`、最大段長殘差約 `8.88e-16 m`。
- 同一輸入已連跑兩次；候選及數值報告 SHA-256 相同，時間另存。見 `reports/rope-reuse-reproducibility.json`。之後新增目標 RMS 診斷欄位，重新產生時需連同該欄位再檢查報告 hash。
- `scripts/solve-somerville-pose.js` 已改為從原鬆結呼叫守長流程，再執行 `scripts/evaluate-somerville-candidate.js`。未完成的總體驗收會回傳 exit code 2。
- `final.json` 現為上述守長候選，總體 **FAIL**；歷史較貼近描線但換過短種子的模型保存在 `pose-videoTight-history.json`，其報告在 `reports/somerville-videoTight-history.json`。
- 現在幾何、材料、正間隙可通過；最終操作、影像輪廓、交叉位置、未解釋繩路與完整運動仍不通過／未驗證。不能只把幾何 PASS 當成成品。

### 遷移範例與驗證

- `src/overhand-recipe.js` 與 `scripts/generate-overhand.js` 產生單股單結解析範例，使用同一曲線、材料、求解器、管體及檢視器，沒有第二套引擎。它是解析範例，不是另一份影片重建。
- 6 mm 鬆結加密至 335,952 個三角面後仍零自交、零折疊、零穿柱。
- 原佈局改 10 mm 繩徑：40 組管面相交、2 個折疊面，**FAIL**。這是參數敏感度結果，不能套用 6 mm 的通過結論。見 `reports/rope-reuse-geometry.json`。
- 已增加近乎平行距離、步中穿越、終點管面守門、固定材料尾端分配、整體剛體變換、不等取樣雙股及錯誤穿環方向測試。最後完整測試／build 和瀏覽器驗收結果應以下方後續補記為準。
- 可遷移性報告與使用邊界：`docs/rope-core-migration.md`。

### 尚未解決，接手時先做這些

1. **先處理核心路由，勿盲目增加迭代。** 管面守門已拒絕許多局部折疊提案，模型只移動數毫米。僅壓縮原有大繞路仍無法得到影片姿態。
2. 新增 `validateOperations(doc,{scope:'final'})`，不再要求最終仍保留施工用斜跨投影；另量測 working bundle 越過所宣告根部分支。當前根部分支對應未通過，必須核對來源與局部框架；不能靠角色名 `over-root` 宣稱它成立。該根部鄰域的幾何定義仍是建模選擇，尚未完成來源對應審核。
3. 有嘗試縮短手側繞路、縮小出口彎曲及改變 cuff 的材料遍歷方向；均有碰撞且來源對應未確認。已從正式生成器移除，保存在 `work/somerville/reuse/compact-route-prototype.js`、`core-route-experiments.json`。**不要採用或把其股序當成已知事實。**
4. 完整管面連續碰撞、操作檢查點隨材料滑動的對應、148 秒核心／交叉標註、獨立 bight 輪廓求解仍待完成。
5. 通用配方目前用於 overhand；Somerville 還有專用生成器及角色適配。下一階段應把核心路由表達為局部框架中的操作區段，保留原有材料身份及來源紀錄。

---

## 以下為 Cursor 的歷史交接，保留供追溯

工作目錄是 `/Users/taichengwong/Projects/RopeGeometry`（計畫寫的 `RopeGeometry2` 沒有任何 Somerville 新檔，不要切過去）。未 commit、未 push、未新增 npm 依賴。`npm test` 82/82、`npm run build` 通過。

## 2026-11-02 續：審查回應與影片路線（這一輪的結果）

GPT 三點都接受，並且第 3 點比他寫的更強：v1 路線有兩處和 68–124 秒影格相反。

1. **鬆結可重現**：同意。`buildSomerville()` 預設仍是 `route:'v1'`，`data/somerville-final/loose.json` 保留。v1 的中心線非局部最小間隙現在是 **3.97905026639391 mm**，最近的一對是 `over-root/0 ↔ over-root/1`。這和 GPT 重算的 3.9791 mm 一致。它仍是中心線距離減去 6 mm 標稱直徑，不是管面間距。
2. **預篩過嚴**：`seedClearance` 不再用固定的一個繩徑當盒子餘裕。盒子在某一軸分開超過一個繩徑、而且分開量減去繩徑已經不小於目前最佳間隙時才跳過。負間隙的線段對不會被跳過。
3. **七項 PASS 不是影片拓樸證明**：同意。帳本在 [`docs/somerville-core-route-ledger.md`](docs/somerville-core-route-ledger.md)，觀察、推論、建模假設分開寫。Codex 可以否決。

**採取的路線不是交換兩次穿環的左右。** 新的 `route:'video'`（`loose-v2.json`，預設 `SOMERVILLE_PRESETS.looseVideo`）：

- 工作束離開 cuff 底部後，經柱下方轉到前方，斜跨四股的前方。
- 第一次穿環由環後到環前，再向 −X 跨過核心。
- 下穿由手側（−X）進、臂側（+X）出，走在四股和柱之間。角色名是 `under-approach`，v1 仍叫 `outside-cuff`。
- 右側短回程，第二次穿環仍由後向前，bight 向 +X。

`validateOperations` 新增 `diagonalOverFrontCuff` 和 `underCuffDirection`。v1 這兩項是 false，原有七項仍是 true。`loose-v2` 九項都是 true。管體：84,000 個三角面，自交 0、折疊 0、穿柱 0。瀏覽器載入後的檢查面板是同一組數字（最小柱間隙 0.702 mm）。

### 收緊到影片核心：沒有做到

把鎖環推進 148 秒標註框（約 x −15…+20 mm、z −13…−43 mm、貼在 cuff 前方）時，斜跨段會切進 cuff，或回程會切進環口。`work/somerville/diag/march.mjs` 能走到的最緊、而且每步都通過管體和九項檢查的預設是 `SOMERVILLE_PRESETS.videoTight`：環半徑 28 mm、環心 z=−46 mm、環仍在柱前 110 mm。它不在標註框裡。再往前推會穿透，所以沒有把那個狀態存成完成。

### 姿態求解：FAIL，但管體還在

`scripts/solve-somerville-pose.js` 從 `videoTight` 出發，段長固定為種子長度，不再縮短隱藏段。彎曲半徑若會小於繩半徑，該步會縮短（`src/somerville-relax.js`）。摺彎不再被拉向影片裡那個很緊的小勾，否則半圓會折回 bight 腿。

`reports/somerville-final-report.json` 的狀態是 **FAIL**。連續兩次執行，`final.json` 與報告的 SHA-1 相同（`fb0b8fca…`、`9002c232…`）。執行時間只寫在 `reports/somerville-final-timing.json`。

| 檢查 | 結果 |
| --- | --- |
| 管體 | PASS（自交 0、折疊 0、穿柱 0）。瀏覽器載入 final 時面板同樣是 0 |
| 九項操作 | PASS |
| 已描線段 | cuff 2.2–12.6 px、長端約 13 px、bight 腿 8–13 px，都低於 30 px。摺彎 **42.7 px**，所以整體 FAIL |
| 畫面上多出來的繩 | **1213** 點。主要是還沒收進核心的 `cuff-to-first`、`loop-to-cuff`、`return-approach` |
| 中心線間隙 | 0.188 mm，低於 0.2 mm 目標 |
| 材料長度 | 比種子短 3.14 mm。單段最大偏差約 1 µm，偏差攤在整條繩上 |

檢視器不會把管體通過顯示成「已對齊影片」。徽章仍是「尚未完成影片姿態對齊」。`crossingPose` 仍是 UNVERIFIED：`data/somerville-pose148.json` 沒有交叉點標註。

畫面：`work/somerville/diag/view-loose-v2-front.png`、`view-loose-v2-rear.png`、`view-loose-v2-side.png`、`view-final-front.png`、`view-final-oblique.png`、`overlay-video.png`。`npm test` 85/85。

下面第 1–6 節是 v1 與上一輪把段長縮短的 PBD 紀錄。不要用那些數字描述 `route:'video'`。

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
