# GoWarehouse 包裹分類系統

> 台灣倉儲業淘寶包裹自動分類工具。**員工拍照 → AI 看圖判斷 → 大字告訴他丟哪一區 → 條碼槍掃包裹存檔**,平均 5 秒一件。

---

## 一、為什麼做這個

每天有幾百個淘寶包裹進倉,要按商品類別分區堆放。
過去靠人工判斷,慢、容易錯、難統計。
本系統把判斷工作交給 Claude AI 視覺辨識,員工只要對著包裹外觀拍一張照片,系統就告訴他丟到哪一區。

---

## 二、技術架構

```
┌──────────────────┐         ┌─────────────────────┐         ┌──────────────────┐
│  手機掃碼端       │         │  Apps Script        │         │  Google Sheets   │
│  mobile.html     │ ──────▶ │  Web App (Code.gs)  │ ──────▶ │  (資料庫)         │
│  (GitHub Pages)  │  POST   │                     │  讀寫    │                  │
└──────────────────┘         │  ┌───────────────┐  │         └──────────────────┘
                             │  │ 1.快取查詢     │  │
┌──────────────────┐         │  │ 2.Claude API  │  │         ┌──────────────────┐
│  桌機管理端       │ ──────▶ │  │   (文字+圖片)  │  │ ──────▶ │  Claude Haiku    │
│  admin.html      │  POST   │  └───────────────┘  │  HTTP   │  4.5 API         │
│  (GitHub Pages)  │         │                     │         └──────────────────┘
└──────────────────┘         └─────────────────────┘
```

| 元件 | 技術 | 成本 |
| --- | --- | --- |
| 後端 | Google Apps Script Web App | 免費 |
| 資料庫 | Google Sheets | 免費 |
| 前端 | 純 HTML + Vanilla JS | 免費 |
| 前端託管 | GitHub Pages | 免費 |
| AI | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) | 約 NT$0.06–0.10 / 包(看圖時) |

### 成本控制三大手段

1. **快取攔截**:每次成功的 AI 判斷會把關鍵字寫入「關鍵字快取」,下次相同關鍵字打字描述時直接命中,不打 API
2. **圖片壓縮**:前端先把照片壓到最大邊 1024px、JPEG 80% 品質,降低 token 數
3. **失敗即降級**:Claude 掛掉時直接顯示「未分類」紅色警示,不會無限重試

預估每天 300 包,初期約 NT$540–900/月,1–2 個月後快取累積成熟,實際費用可降到 NT$100–200/月。

---

## 三、檔案結構與職責

```
warehouse-classifier/
├── README.md                 ← 你正在看的這份(架構總覽)
├── backend/
│   └── Code.gs               ← Apps Script 後端:分類邏輯 / Sheets 讀寫 / Claude API / 金鑰管理
├── frontend/
│   ├── mobile.html           ← 員工手機端:拍照 + 條碼槍 + QR 掃描 + 大字結果
│   └── admin.html            ← 主管桌機端:即時列表 / 篩選 / 修正 / 統計 / 匯出
└── docs/
    ├── DEPLOYMENT.md         ← 完整部署步驟(Apps Script / GitHub Pages / 條碼槍配對)
    └── TESTING.md            ← 測試清單與常見問題排查
```

### 各檔案做什麼

**`backend/Code.gs`** — 整個系統的大腦
- `doPost(e)`:接 mobile/admin 的請求,依 `action` 分派
- `handleClassify(body)`:文字判斷,兩層流程(快取 → Claude)
- `handleClassifyImage(body)`:圖片判斷(直接 Claude Vision)
- `learnKeyword(...)`:把 AI 成功命中的關鍵字寫入「關鍵字快取」
- `getEmployees()` / `getCategories()`:讀取動態清單給前端
- `setupApiKeys()`:**手動執行一次**,把 Claude API Key 和 Sheet ID 寫進 PropertiesService

**`frontend/mobile.html`** — 員工拿在手上的單頁
- 頂部:操作員下拉選單(localStorage 記住)
- 中段:**📷 拍照按鈕**(主)+ 文字輸入框(備援,給拍不清楚的包裹)
- 結果區:**滿版大字 + 整片底色變色** 顯示「丟到 X 區」
- 底部:包裹編號輸入框(永遠保持 focus,Enter 自動送出),也支援相機掃 QR

**`frontend/admin.html`** — 主管在電腦上看的後台
- 即時表格(每 10 秒 refresh)
- 篩選器:操作員 / 類別 / 日期區間
- 行內編輯:點分類欄位可直接改,改完反向更新快取
- 類別管理 / 員工管理 / Excel 匯出
- 今日統計卡片:總數、各類別、各員工處理量

---

## 四、Google Sheets 結構

> 一個 Sheet 檔案,共 4 個分頁。Sheet ID 在部署時填入 `setupApiKeys()`。

| 分頁名稱 | 欄位 |
| --- | --- |
| `包裹紀錄` | 時間 \| 包裹號 \| 商品描述 \| 類別 \| 信心度 \| 來源 \| 操作員 |
| `類別清單` | 類別代碼 \| 類別名稱 \| 倉庫位置 |
| `關鍵字快取` | 關鍵字 \| 類別 \| 命中次數 |
| `員工清單` | 員工姓名 \| 是否啟用 |

> 「來源」欄記錄這筆分類從哪裡來:`快取` / `Claude` / `Claude(圖)` / `人工` / `失敗`

---

## 五、核心流程(員工端)

```
選操作員(只選一次,localStorage 記住)
     ↓
方式 A:📷 拍照(主要)→ 自動上傳並判斷
方式 B:打字描述 → 按「判斷文字」 → 先查快取沒命中再打 Claude
     ↓
大字顯示「丟到 X 區」+ 信心度 + 整片底色變色 + 震動
     ↓
條碼槍掃包裹號(自動 Enter)/ 或相機掃 QR / 或鍵盤打
     ↓
寫入 Sheets「包裹紀錄」+ AI 命中時自動學習關鍵字到快取
     ↓
畫面清空,自動 focus 回輸入框,等下一個包裹
```

---

## 六、安全與權限

- **API Key 不放在前端**:Claude key 存在 Apps Script 的 `PropertiesService`,只有後端讀得到
- **mobile.html 與 admin.html 不互連**:admin 網址只有主管知道,員工拿不到
- **不做帳號密碼**:用下拉選單選操作員,降低使用門檻;所有紀錄都帶上操作員名稱便於追蹤
- **動態清單**:類別、員工都從 Sheets 即時讀取,不寫死在程式碼

---

## 七、部署摘要

完整步驟見 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)。簡述如下:

1. 建立 Google Sheet,加好 4 個分頁(欄位如上)
2. 把 `backend/Code.gs` 貼進新建的 Apps Script 專案
3. 替換 `setupApiKeys()` 中的 `YOUR_xxx_HERE`,執行一次寫入 Claude Key 與 Sheet ID
4. 部署為 Web App(任何人皆可存取)
5. 把 `frontend/` 兩個 HTML 推到 GitHub repo,開啟 GitHub Pages
6. 在兩個 HTML 中填入 Apps Script Web App URL
7. 員工手機開 mobile.html(必須是 HTTPS 才能用相機),主管電腦開 admin.html

---

## 八、開發狀態

- [x] 步驟 1:資料夾結構與 README
- [x] 步驟 2:`backend/Code.gs` 後端
- [x] 步驟 3:`frontend/mobile.html` 手機端(拍照模式)
- [x] 步驟 4:`frontend/admin.html` 桌機端
- [x] 步驟 5:`docs/DEPLOYMENT.md` 部署說明
- [x] 步驟 6:`docs/TESTING.md` 測試清單

## 暫緩功能(MVP 跑順後再加)

- QR 指紋快取:拍照同時掃出 QR(淘寶商品連結),用 `taobao:商品ID` 當 cache key,同款商品第二次起免費
- Prompt 與壓縮優化:若實測標籤辨識率不高,把 prompt 改成「優先讀標籤文字」、壓縮 maxDim 從 1024 → 1600
