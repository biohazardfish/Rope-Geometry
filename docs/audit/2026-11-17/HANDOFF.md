# 接手說明：從雲端 agent 交回本地（2026-11-18，UTC+8）

這份文件給接手的本地 agent 或使用者閱讀。它總結雲端對話（2026-11-17 至 11-18）的結論，讓工作可以在本地延續。
根目錄的 `handoff.md` 是舊的 Somerville 工作紀錄，已被定位為歷史檔案，**不要**把它當作目前狀態。

本 commit 之後打了 tag `research-archive-2026-11-17`：舊 Rope Geometry Repo 自此定位為 **Research Archive**，不再繼續重構。

---

## 1. 審計結果（詳見同目錄七份報告）

先讀 [PROJECT_STATUS.md](PROJECT_STATUS.md) 與 [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md)。審計時實際執行並確認的事實：

- `npm test`：146 個測試，145 通過，1 失敗。失敗的是 `test/rope-core.test.js` 對 `loose-v2.json` 的逐位元比較；Linux 與 macOS 的浮點最後一位不同，最大差 2.8e-16 m。CI 自 2026-11-10 起一直失敗，現行五步 workflow 從未通過。
- `npm run generate:dressed` 在 Linux 可重現 `loose-v3` 的全部閘門數值：0 穿透、+0.317 mm 間隙、管體有效、九項操作檢查通過、姿態 RMS 109.44 px（FAIL）。但檔案 SHA 和 `handoff.md` 記錄的 `ea7676ee…` 不同，因為那些 SHA 只在 macOS 上成立。
- `npm run report:phase4b` 會中止：它的基準雜湊檢查不接受 `src/topology.js`，雖然該檔自第一個 commit 起就沒有改過。
- 最大的架構問題：六套互不相連的 topology 表示；Phase 4B evidence ledger 從未進入任何生成器；沒有任何程式能從幾何提取 crossing 結構，再和證據比較。

## 2. 決定：另建新 Repo（暫名 RopeLab）

- **不 fork，不整包複製 `src/`，不先清理舊 Repo。** 新 Repo 從零開始建立 git history。每個移植過去的模組都要記錄來源 commit、原始路徑和修改內容，並連同測試一起移植。
- **最底層是 Material Identity**（`rope-state.js` 的材料座標 `s0`），其上才是空間幾何。Topology 描述同一條材料怎樣穿繞、交叉和受約束，不取代材料身份。
- **分層架構：**
  - Layer 0 Material
  - Layer 1 Evidence
  - Layer 2 Topology
  - Layer 3 Geometry（雙向：topology → centerline，以及 centerline → 投影 crossing）
  - Layer 4 Operations
  - Layer 5 Motion
- **資料分三種性質：** Evidence（觀察）、Topology Hypothesis（可以部分確定，多個假設並存）、Verified Topology（只能由人確認後提升）。資料不足時必須回傳 UNVERIFIED。
- **直接繼承（連同測試）：** `robust-distance.js`、`rope-state.js`、`rope-frames.js`、`rope-tube.js`、`rope-lengths.js`。但只在需要時才移植；Milestone 1 只需要 `rope-state.js`、`schema.js` 的資料契約，以及 `robust-distance.js`（交叉驗證用）。
- **改造後繼承：** `schema.js`（拆掉對舊 collision kernel 的依賴，只有 `detectAt` 一處）、`rope-relax.js`（移除寫死的 6 mm 直徑與柱半徑）、`rope-curves.js`、`rope-acceptance.js`（保留三態原則，重寫判定項目）、`material-topology.js`、`extended-gauss.js`、`rope-edit-session.js` 的 step/replay 機制。
- **只作研究證據保存：** `loose-v3.json`（幾何有效、拓撲未驗證的對照樣本，**不是** ground truth）、Phase 4B ledger、Phase 1–3 的正反例、Phase 5 / Recovery 的失敗案例。
- **不繼承：** `somerville-build.js` / `somerville-dressed.js`（手寫路由加調參）、舊的 `geometry.js` kernel、五個獨立 viewer、`somerville-relax.js`、歷史 generator 和參數搜尋腳本、舊 README / `handoff.md`。
- **CI 從第一天起在 macOS 和 Linux 上跑。** 跨平台幾何比較用明確的數值容差；同一次執行內的確定性另外測試。不以跨平台逐位元 SHA 作為幾何正確性的證據。
- **第一個 Milestone 完成之前，不寫新的 Somerville generator。**

## 3. Milestone 1：Topology Ground Truth

目標：讓電腦能回答「這個 3D 模型的穿繞結構，是否與人工確認的繩結相符？哪些地方還不能確定？」

雲端 agent 對原方案的修正：

1. **單一投影的 crossing 比較會被視角左右。** loose-v3 的相機和影片對不上（109 px），即使拓撲正確，投影出來的 crossing 也會不同。所以 topology document 要分兩層：
   - **視角相關**的 crossing 標註：附上相機資訊，只和同一視角的投影比較。
   - **視角無關**的關係事實：例如「材料段 [a,b] 由前往後穿過材料段 [c,d] 圍成的繩圈」、「繞柱的帶正負號圈數」。比較 loose-v3 時主要靠這一層。
2. **第一版不處理拓撲等價**（相對於柱、端點固定的 isotopy 是研究級問題）。第一版只回答：在同一材料參數化下，兩份資料的關係是否一致。等價性明確寫成「不主張」。
3. **瓶頸是證據，不是架構。** 拍攝時讓材料座標成為可觀察的證據（見 §5）。
4. **標註 UI 最小化。** 第一版可以只是在靜止畫面上點選並輸出 JSON，甚至手寫 JSON。成功標準是資料契約、validator 和比較器，不是 UI。
5. **每段影片是獨立的觀察 session。** 「兩個 session 是同一個拓撲狀態」是需要人確認的假設。

驗收順序：先通過一個簡單、答案已知的開放繩 crossing 測試（可用 Phase 2/3 fixtures），再處理人工標註的 Somerville。

## 4. 影片 B 的觀察（使用者自綁、未拉緊、繞拍）

影片和抽出的畫面都在使用者的 Mac 上，**沒有**放進 Repo：

| Session | 原始檔 | 規格 | 畫面資料夾（2 fps，1280 px 寬；`f_NNNN` 約在 (NNNN−1)×0.5 秒） |
| --- | --- | --- | --- |
| IMG_0787 | `/Users/taichengwong/Projects/RopeGeometry/IMG_0787.MOV` | 70.3 s，1920×1080，60 fps | `/Users/taichengwong/Projects/RopeGeometry/img0787-frames/` |
| IMG_0785 | `/Users/taichengwong/Downloads/IMG_0785.MOV` | 約 39 s（78 張畫面） | `/Users/taichengwong/Downloads/img0785-frames/` |

**場景：** 黑色金屬框架的方形截面橫桿，繩結緊貼一根直立柱。三股天然纖維繩，目測 6–8 mm（未量度）。橫桿頂部可見四條平行的 cuff 繩段。這根方形橫桿和舊模型的圓柱（半徑 27.5 mm）不同，所以只能在拓撲層面和 loose-v3 比較，不能做幾何或像素比較。

**建議優先標註的畫面：**

- IMG_0787：正面 `f_0001`、`f_0013`；背面 `f_0081`、`f_0085`（橫向雙股帶束住四條直落繩段）；手撥開 `f_0039`、`f_0043`；斜側 `f_0019`、`f_0105`。約 44 秒之後大多不能用。
- IMG_0785：正面含下垂長繩圈 `f_0005`；左斜側 `f_0011`、`f_0019`；左側面 cuff 螺旋 `f_0059`（**可能**可判斷繞柱方向，需人工確認）；頂面 `f_0063`；背面較鬆 `f_0027`、`f_0033`、`f_0047`、`f_0055`；`f_0051`。約 34 秒之後模糊，不能用。

**兩段的狀態看來不完全一樣：** 0787 背面是整齊的橫向雙股帶，0785 背面較鬆、繩段斜向繞過。大致結構一致，但要合併兩段的證據，必須先由使用者確認兩次拍攝之間沒有抽出或重新穿過繩端。

**合計覆蓋：**

| 部位 | 狀態 |
| --- | --- |
| 正面、背面、左側 | 足夠 |
| 頂面 | 基本可用 |
| 柱側那一面 | 缺 |
| 底部 | 缺 |
| 結芯內部穿繞 | 大部分仍是 UNKNOWN |
| 兩端身份 | 缺 |

## 5. 補拍建議（依效益排序）

1. 用固定機位**拍下綁結過程**，每一步停一兩秒。
2. 繩上每 10 cm 貼一圈編號膠帶，兩端用不同顏色區分。
3. 把繩結移離直立柱。
4. 用手指把結芯撐開到有幾公分空隙再拍。
5. 頂部和底部用拍照而不是錄影：鎖定對焦和曝光（AE/AF Lock）、連拍或自拍計時，加一盞燈。
6. 光線一致。

**Spatial photo：** 只能作為補充。它幫得上的是看得見的交叉點的上下關係，以及日後的 3D 對齊；解決不了遮擋。若要試，先傳一張原始 HEIC，確認能否取出左右兩個視角、視差夠不夠。

## 6. 抽畫面的命令（macOS，zsh 互動模式下不要貼含 `#` 的註解行）

```bash
cd /path/to/video/folder
ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate -of compact IMG_XXXX.MOV
mkdir -p imgXXXX-frames
ffmpeg -hide_banner -loglevel error -i IMG_XXXX.MOV -vf "fps=2,scale=1280:-2" -q:v 3 imgXXXX-frames/f_%04d.jpg
ffmpeg -hide_banner -loglevel error -i IMG_XXXX.MOV -vf "fps=1/2,scale=480:-2,tile=4x3" -q:v 3 imgXXXX-frames/sheet_%02d.jpg
```

## 7. 下一步（尚未開始）

1. 用上述畫面整理第一份「部分確定」的拓撲觀察清單。每項附畫面編號和 session，標記 CONFIRMED / HYPOTHESIS / UNKNOWN，交由使用者逐項確認。
2. 起草 RopeLab Milestone 1 規格：topology document 資料契約（欄位層級 UNKNOWN、證據引用、兩層關係）、比較器定義、Phase 2/3 已知答案測試、移植清單和來源記錄格式。
3. 補拍（§5）。
