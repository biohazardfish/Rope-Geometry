# Phase 4B 交付索引

**結論：部分路徑仍無法確定。** 尚未建立有證據支持的完整 E0 → E1 材料路徑，也尚未確認原作者示範與目標影片完成結之間的逐股一一對應。本階段沒有生成 3D knot。

已辨識四股正面 cuff、兩段可見長端繩股及相連的兩條 bight 繩臂。未能確定 cuff 背面與 locking core 的逐股接續。觀察圖的 9 個分量包含兩個未綁定端點標籤；14 個待接續端口是證據缺口，不代表實際繩子斷開。

舊 12 項未知：**6 項部分解決、5 項仍未知、1 項修正原先描述、0 項完全解決**。兩個已記錄 crossing 僅屬詳細圖第 8 步，不能套入完成結。完整完成結的 crossing 數量與 traversal 仍未建立。

## 交付檔案

- [拓撲 v2 JSON](../../data/somerville-bowline-topology-v2.json)
- [主要機器可讀報告](../../phase4b-report.json)
- [逐項審查、12 項前後對照及精確缺證清單](review.md)
- [可見材料區段 ledger](material-ledger.md)
- [Crossing 雙次 traversal 表](crossing-traversal.md)／[CSV](crossing-traversal.csv)
- [來源證據索引](evidence-index.md)
- [本機影片身份、長度和 SHA256](../../references/phase4b/local-video-manifest.json)
- [v2 資料契約與驗證邊界](../../docs/phase4b-topology-v2.md)
- SVG：[完成狀態](../../diagrams/phase4b/completed.svg)、[繞柱展開](../../diagrams/phase4b/wrapping.svg)、[材料 ledger](../../diagrams/phase4b/material.svg)、[施工第 8 步](../../diagrams/phase4b/construction.svg)
- Viewer 截圖：[完成狀態](viewer-completed.png)、[施工交叉](viewer-construction.png)、[材料 ledger](viewer-material.png)

## 實際驗證

| 項目 | 結果 |
| --- | --- |
| `npm test` | 20/20 通過，包含原有 12 項及新增 8 項 |
| `npm run report:phase4b` | 記錄一致性通過；完整材料路徑未建立；90 個證據資產雜湊吻合 |
| 原有核心、fixtures、tests、reports、SVG 保留檢查 | 30 個基線檔案未變；viewer 整合修改另列 |
| `npx vite build` | 成功；有單一 bundle 大於 500 kB 的提示 |
| `npm run verify:blender` | 4 個既有 Phase 1–3 幾何往返通過；最大座標／半徑誤差 3.999999997894577e-9 m，容差 1e-7 m |
| 實際 viewer 操作 | 四個新視圖切換、證據圖片連結、切回 Phase 4／3／C／A、Phase 3 負例；未發現 console error |

[測試記錄](verification-tests.txt) · [報告產生記錄](verification-report.txt) · [Build 記錄](verification-build.txt) · [Blender 記錄](verification-blender.txt) · [驗證摘要 JSON](verification.json)

執行 `npm run dev`，選擇「Phase 4B · material evidence」。圖面像素座標只作標註；來源影片、施工狀態和完成狀態保持分開。測試證明內部一致性與既有功能相容，不能證明照片判讀正確。未驗證獨立部署、完整繩路、全部完成態 crossing、逐股跨來源對應或任何 3D knot。

兩輪研究已結束；下一步所需的背面／鎖結核心／端點可見影像條件詳列於 review.md。本次停在參考重建，不進行幾何生成、動畫或物理模擬。
