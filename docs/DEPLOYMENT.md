# 部署指南

> 目標讀者:第一次部署的你(非技術背景也能跟著做完)。
> 全程預估 60–90 分鐘。中間遇到任何步驟卡住,跳到最底下「常見錯誤」對照排查。

---

## 部署順序總覽

```
1. Google Sheet      ← 準備資料庫(15 分鐘)
2. Anthropic API     ← 拿到 Claude Key + 設花費上限(10 分鐘)
3. Apps Script       ← 後端部署(15 分鐘)
4. GitHub Pages      ← 前端託管(15 分鐘)
5. 條碼槍配對        ← 員工手機配對藍牙條碼槍(5 分鐘)
6. 端對端測試        ← 跑一次完整流程確認沒問題(10 分鐘)
```

---

## 1. Google Sheet 資料庫

### 1-1 建立 Sheet

1. 打開 [Google Sheets](https://sheets.google.com),點「+」建立新試算表
2. 把試算表命名為 **GoWarehouse 包裹分類資料庫**(名字隨意,但要記得)

### 1-2 建立 4 個分頁

點底部的「+」新增分頁,共要有以下 4 個分頁(分頁名稱要**完全一致**,後端會用名字找它):

#### 分頁 1:`包裹紀錄`

第一列填欄位名(這是表頭,後端跳過第一列):

| A | B | C | D | E | F | G |
| --- | --- | --- | --- | --- | --- | --- |
| 時間 | 包裹號 | 商品描述 | 類別 | 信心度 | 來源 | 操作員 |

#### 分頁 2:`類別清單`

| A | B | C |
| --- | --- | --- |
| 類別代碼 | 類別名稱 | 倉庫位置 |

填上你倉庫的初始類別,例如:

| A1 | 服飾 | 1樓 A 區 |
| A2 | 鞋類 | 1樓 B 區 |
| B1 | 3C 電子 | 2樓 A 區 |
| B2 | 玩具 | 2樓 B 區 |
| C1 | 食品 | 1樓 C 區(冷藏旁) |

> 之後在 admin.html 的「類別管理」分頁也可以再加,不用一次填完。

#### 分頁 3:`關鍵字快取`

| A | B | C |
| --- | --- | --- |
| 關鍵字 | 類別 | 命中次數 |

(留空就好,系統會自己學習填入。)

#### 分頁 4:`員工清單`

| A | B |
| --- | --- |
| 員工姓名 | 是否啟用 |

填初始員工名單,B 欄填 `TRUE` 表示啟用:

| 王大明 | TRUE |
| 李小華 | TRUE |
| 陳美麗 | TRUE |

### 1-3 取得 Sheet ID

打開 Sheet 的網址,長這樣:

```
https://docs.google.com/spreadsheets/d/   1aBcD...XyZ   /edit#gid=0
                                       └──── 這段就是 Sheet ID ────┘
```

複製 `/d/` 和 `/edit` 之間那串字,**等一下會用到**。

---

## 2. Anthropic API(Claude API Key)

### 2-1 註冊與儲值

1. 到 [console.anthropic.com](https://console.anthropic.com) 用 Google 帳號登入
2. 左側 **Plans & billing** → **Add credits**(加值)
   - 第一次至少要加 USD $5(約 NT$165)
   - 一張圖片約 NT$0.06–0.10,USD $5 大概可以判斷 1500–2500 張
3. **重要:設花費上限,避免帳單失控**
   - 同一頁找 **Limits** → **Monthly spend limit** → 設 USD $30(約 NT$1000)
   - 達到上限會自動停止呼叫,不會再扣錢

### 2-2 建立 API Key

1. 左側 **API Keys** → **Create Key**
2. 名稱填 `gowarehouse`(隨意)
3. **複製出現的 Key,等一下會用到**(離開頁面後就看不到了)
   - 格式長這樣:`sk-ant-api03-xxxxxxxxxx...`

---

## 3. Apps Script 後端部署

### 3-1 建立 Apps Script 專案

1. 打開你剛建好的 Google Sheet
2. 上方選單:**擴充功能** → **Apps Script**
3. 出現編輯器,左上專案名稱改成 `GoWarehouse 後端`(隨意)
4. 把編輯器裡預設的 `function myFunction() { ... }` 整個刪掉

### 3-2 貼上 Code.gs

1. 打開你電腦上的 `backend/Code.gs`(用任何文字編輯器或在終端機 `open backend/Code.gs`)
2. **全選 → 複製**
3. 貼到 Apps Script 編輯器
4. 按右上 **儲存**(💾 圖示)或 `Cmd+S`

### 3-3 寫入金鑰

1. 在編輯器找到 `setupApiKeys` 函式(大概在第 50 行)
2. 把這三個 placeholder 替換成你剛才拿到的東西:
   ```javascript
   'CLAUDE_API_KEY': 'sk-ant-api03-xxx...',  // ← 你的 Claude Key
   'SHEET_ID':       '1aBcD...XyZ'           // ← 你的 Sheet ID
   ```
3. **儲存**
4. 上方下拉選單選擇函式 `setupApiKeys` → 按 **▶ 執行**
5. 第一次會跳「需要授權」→ 點「審查權限」→ 選你的 Google 帳號 → 「進階」→ 「前往(不安全)」→ 「允許」
   - 「不安全」是因為你寫的程式還沒被 Google 驗證過,**自己寫的腳本是安全的**
6. 看下方「執行紀錄」應該出現:
   ```
   ✅ 金鑰已寫入 PropertiesService。可以執行 verifySetup() 確認設定正確。
   ```

### 3-4 驗證設定

1. 函式選擇 `verifySetup` → ▶ 執行
2. 執行紀錄應該出現:
   ```json
   {
     "CLAUDE_API_KEY": "已設定(108 字元)",
     "SHEET_ID": "已設定(44 字元)",
     "分頁 [包裹紀錄]": "✅",
     "分頁 [類別清單]": "✅",
     "分頁 [關鍵字快取]": "✅",
     "分頁 [員工清單]": "✅"
   }
   ```
3. 任一項出現 ❌ → 對照「常見錯誤」排查
4. 順手也跑一次 `testClaude` 驗證 Claude API 通,執行紀錄會看到 Claude 回的 JSON 分類結果

### 3-5 部署為 Web App

1. 右上 **部署** → **新增部署作業**
2. 齒輪圖示 ⚙️ → **網頁應用程式**
3. 設定:
   - **說明**:填 `v1` 或留空
   - **執行身分**:**我**(就是你的 Google 帳號)
   - **存取權**:**任何人**(這樣前端不需登入就能呼叫)
4. **部署**
5. 跳出「網頁應用程式網址」,長這樣:
   ```
   https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec
   ```
6. **複製這個 URL,等一下要填進前端 HTML**

### 3-6 測試 Web App

打開瀏覽器,貼上剛才的 URL 直接訪問,應該看到:
```json
{"ok":true,"message":"GoWarehouse 分類系統正常運作"}
```

看到這行就表示後端 OK 了。

> **改了 Code.gs 後要重新部署**:每次修改程式碼後,要回 **部署** → **管理部署** → 鉛筆圖示 → **版本** 改成「新版本」→ **部署**,新的 URL **不會變**(這是好事)。

---

## 4. GitHub Pages 前端

### 4-1 建立 GitHub Repo

1. 到 [github.com](https://github.com) 登入,點右上 「+」→ **New repository**
2. 名稱:`warehouse-classifier`(隨意,**但記得要設成 Public**,Pages 才能用免費版)
3. 勾選 **Add a README file**
4. **Create repository**

### 4-2 替換 API_URL 並上傳

**選項 A:用網頁直接編輯(最簡單)**

1. 打開電腦上的 `frontend/mobile.html`,搜尋 `YOUR_APPS_SCRIPT_WEB_APP_URL_HERE`
2. 把它換成步驟 3-5 拿到的 Web App URL,儲存
3. `frontend/admin.html` 也做同樣的事
4. 在 GitHub repo 頁面,點 **Add file** → **Upload files**
5. 把 `mobile.html` 和 `admin.html` 拖進去
6. 下方填 commit message:`add frontend`
7. **Commit changes**

**選項 B:用終端機 git push(熟 git 的話比較快)**

```bash
cd /Users/chinagleo/Desktop/warehouse-classifier
git init
git add .
git commit -m "initial"
git branch -M main
git remote add origin https://github.com/<你的帳號>/warehouse-classifier.git
git push -u origin main
```

### 4-3 啟用 GitHub Pages

1. Repo 頁面 → **Settings** → 左側 **Pages**
2. **Source**:選 **Deploy from a branch**
3. **Branch**:選 `main` / `/ (root)` → **Save**
4. 等 1–2 分鐘,頁面上方會出現:
   ```
   Your site is live at https://<你的帳號>.github.io/warehouse-classifier/
   ```

### 4-4 確認前端可開

開瀏覽器:
- 員工端:`https://<你的帳號>.github.io/warehouse-classifier/frontend/mobile.html`
- 主管端:`https://<你的帳號>.github.io/warehouse-classifier/frontend/admin.html`

兩個頁面都應該能載入,且操作員下拉、類別下拉有資料。

---

## 5. 藍牙條碼槍配對(可選)

> 如果暫時不用條碼槍,跳過這節,直接用相機掃 QR 或鍵盤打字也能用。

### 5-1 把條碼槍切到 HID(藍牙鍵盤)模式

每家條碼槍配對方式不一樣,但 99% 的款式都支援 **HID 模式**(把自己偽裝成藍牙鍵盤)。
- 看你的條碼槍說明書,通常是掃描說明書上印的「HID Mode」或「Keyboard Mode」那個專用 QR
- 切換成功通常會嗶一聲

### 5-2 配對到手機

**iPhone:**
1. 設定 → 藍牙 → 開啟
2. 條碼槍上長按配對鍵(看說明書,通常是電源鍵長按 5 秒)
3. iPhone 出現 `Barcode Scanner xxx` → 點選配對
4. 配對成功後,**到設定 → 一般 → 鍵盤,把語言切到「英文 (美國)」**(避免中文輸入法吃掉條碼)

**Android:**
- 跟 iPhone 步驟類似,藍牙設定中找到掃描槍配對

### 5-3 設定條碼槍掃完自動加 Enter

99% 的條碼槍預設掃完就會自動送出 Enter,如果你的不會:
- 翻說明書找「Suffix」或「Terminator」設定
- 通常掃一個 `Add Enter Suffix` 的 QR 就會啟用

### 5-4 測試

1. 打開員工手機的 mobile.html
2. 確認包裹編號輸入框被 focus(綠色框框 + 閃)
3. 用條碼槍掃任何條碼
4. 包裹編號自動填入,且應該觸發送出(因為自動 Enter)

---

## 6. 端對端測試

### 6-1 主管端基本檢查

1. 開 admin.html
2. 確認三個分頁都能切換
3. 「類別管理」應該看到你建的類別
4. 「員工管理」應該看到員工清單

### 6-2 員工端跑一個完整流程

1. 員工手機開 mobile.html
2. 頂部選自己的名字
3. 按 **📷 拍照**,對任何商品(玩具、衣服都可以)拍一張
4. 等 2–5 秒,結果會大字顯示「丟到 X 區」
5. 用條碼槍掃任何條碼,或在輸入框打 `TEST-001` 然後按 Enter
6. 看到「✅ 已記錄」
7. 畫面自動清空

### 6-3 確認資料寫入

1. 切到 admin.html(主管端不用重新整理,10 秒會自動更新)
2. 「包裹紀錄」分頁應該看到剛才那筆
3. 切到 Google Sheet 「包裹紀錄」分頁,確認最後一列是新加的紀錄

跑通了 → 完成 🎉

---

## 常見錯誤排查

### 後端

| 錯誤訊息 | 可能原因與解法 |
| --- | --- |
| `分頁 [包裹紀錄]: ❌ 找不到` | 分頁名稱拼錯。Sheet 上的分頁名一個字都不能差(包含全形空格) |
| `Sheet 開啟: ❌ ...not found` | Sheet ID 填錯;或 Apps Script 帳號不是 Sheet 擁有者 → 把 Apps Script 跟 Sheet 用同一個 Google 帳號開 |
| `Claude HTTP 401` | API Key 錯;或忘了去 console.anthropic.com 加信用卡 |
| `Claude HTTP 529` | Anthropic 那邊塞車,重試一下;或調整 prompt 簡短一點 |
| `verifySetup` 顯示 Key 字元數 = 0 | `setupApiKeys` 沒執行成功;或執行成功但忘了改 placeholder |

### 前端

| 症狀 | 解法 |
| --- | --- |
| 操作員下拉是空的 | 員工分頁 B 欄忘了填 `TRUE`;或 Web App URL 沒填正確 |
| 拍照後一直「判斷中」轉很久 | Apps Script 回應慢(免費版有 6 分鐘限制),通常 5–15 秒;超過 30 秒檢查 console.anthropic.com 是否儲值 |
| Console 出現 `CORS error` | Apps Script 部署時「存取權」沒設成「任何人」,重新部署 |
| iOS 拍照沒反應 | iOS 14.5 以下不支援 `<input capture>`,要員工升級系統 |
| 條碼槍掃完沒反應 | 1) 焦點不在輸入框 → 點一下框 2) 輸入法不是英文 → 切英文 3) 條碼槍沒設 Enter Suffix |

### 帳單

| 症狀 | 解法 |
| --- | --- |
| 一天才幾包就花一堆錢 | 每筆紀錄看「來源」欄,正常應該大量是「快取」;若都是「Claude(圖)」,代表快取沒起作用 → 檢查「關鍵字快取」分頁是否有資料 |
| Anthropic 帳單比預期高 | 到 console.anthropic.com → Usage 看每日用量;確認 Limits 有設上限 |

---

## 升級或修改後重新部署

### 改 Code.gs

1. 編輯 Apps Script 編輯器內的程式
2. **儲存**
3. **部署** → **管理部署** → 鉛筆 → **版本** 選「新版本」→ **部署**
4. URL 不變,前端不用改

### 改 mobile.html / admin.html

1. 在 GitHub repo 編輯檔案 → Commit
2. GitHub Pages 通常 30 秒內就會更新
3. 員工手機開頁面時要強制重新整理(下拉刷新或關掉瀏覽器分頁重開)

### 加新類別 / 新員工

不用改程式碼。直接到 admin.html 的「類別管理」/「員工管理」加,**或是在 Google Sheet 直接加列**(後端是動態讀的)。
