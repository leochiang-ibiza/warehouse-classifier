# 部署你自己的副本(給朋友的指南)

> 這份是寫給「想要把這套系統用在自己倉庫」的人看的。
> 整個流程你會擁有 **自己的 Sheet、自己的 API Key、自己的網址**,跟原作者完全獨立、互不影響。
>
> 完整需要約 **60–90 分鐘**,前提是有跟著步驟做、不亂搞。

---

## 你會得到什麼

跑完之後你會有兩個專屬網址:

```
員工手機端(發給倉庫員工用):
https://<你的GitHub帳號>.github.io/warehouse-classifier/frontend/mobile.html

主管桌機端(自己看):
https://<你的GitHub帳號>.github.io/warehouse-classifier/frontend/admin.html
```

員工拿手機開第一條,拍包裹照片,系統用 AI 自動判斷類別,大字告訴他丟到哪一區。
主管在電腦開第二條,即時看所有紀錄、修正錯誤判斷、匯出報表。

---

## 你需要先準備的帳號

| 帳號 | 怎麼來 | 有沒有費用 |
| --- | --- | --- |
| Google 帳號 | 你應該已經有 Gmail | 免費 |
| GitHub 帳號 | github.com 註冊 | 免費 |
| Anthropic 帳號 | console.anthropic.com 註冊 | **要儲值最少 USD $5** |

**一定先準備好上面三個。** 沒辦法分階段做,中間每一步都會用到。

---

## 部署流程(7 步驟)

### Step 1:Fork 原作者的 GitHub repo

1. 用瀏覽器開原作者的 repo:
   ```
   https://github.com/leochiang-ibiza/warehouse-classifier
   ```
   (請原作者把網址給你)
2. 右上點 **Fork** 按鈕
3. **Owner** 選你自己的帳號
4. **Repository name** 保持 `warehouse-classifier`(改也可以)
5. **不要勾** 「Copy the main branch only」(讓所有歷史都一起複製)
6. **Create fork**

完成後你會有自己的 repo:`https://github.com/你的帳號/warehouse-classifier`

### Step 2:把 repo 抓到你的 Mac(可選但推薦)

如果你會用終端機:
```bash
cd ~/Desktop
git clone https://github.com/你的帳號/warehouse-classifier.git
cd warehouse-classifier
```

不會用終端機也沒關係,後面的編輯都可以直接在 GitHub 網頁上做。

### Step 3-6:照 `docs/DEPLOYMENT.md` 一步一步做

**完整步驟在另一份文件裡,從第 1 節開始照著做就行:**

- 1. **Google Sheet 資料庫** ← 建你自己的試算表
- 2. **Anthropic API** ← 拿你自己的 Claude Key
- 3. **Apps Script 後端部署** ← 把 `backend/Code.gs` 貼進去 + 填你自己的 Key 和 Sheet ID
- 4. **GitHub Pages 前端** ← 從這節開始有點不一樣,看下方說明

### Step 7:GitHub Pages(因為已 fork,稍微不同)

跟 `DEPLOYMENT.md` 第 4 節有兩個差異:

#### 差異 1:跳過「建立 GitHub Repo」
你 fork 過來就已經有 repo 了,這步免做。直接看下面的「替換 API_URL」。

#### 差異 2:替換 API_URL 的位置不一樣

兩個 HTML 檔的 `API_URL` 目前是**原作者的網址**,你要改成**你自己的 Apps Script Web App URL**。

**做法 A:用 GitHub 網頁直接改**(最簡單)

1. 打開你的 repo 頁面 → 進 `frontend/mobile.html`
2. 右上鉛筆圖示(Edit)
3. **Cmd + F** 搜尋 `script.google.com`,會找到一行:
   ```javascript
   const API_URL = 'https://script.google.com/macros/s/AKfycbx-.../exec';
   ```
4. 把整條 URL 換成你自己 Apps Script 部署後拿到的 URL
5. 右上 **Commit changes**(提交訊息隨便填)
6. 對 `frontend/admin.html` 重複一樣的步驟

**做法 B:用 Mac 終端機改**(會 git 的話)

```bash
cd ~/Desktop/warehouse-classifier
# 用任何編輯器打開,把 API_URL 換成你自己的
# 然後:
git add frontend/
git commit -m "use my own Apps Script URL"
git push
```

#### 差異 3:啟用 GitHub Pages(你的 repo 上)

1. 你的 repo 頁面 → **Settings** → 左側 **Pages**
2. **Source**:選 **Deploy from a branch**
3. **Branch**:`main` / `/ (root)` → **Save**
4. 等 1–2 分鐘,網址會出現:`https://<你的帳號>.github.io/warehouse-classifier/`

---

## 驗證:跑一次完整流程

照 `docs/TESTING.md` 「一、上線前驗收清單」走一遍。重點檢查:

- [ ] 後端 `verifySetup` 看到 4 個分頁都 ✅
- [ ] 後端 `testClaude` 回傳 JSON 含 category
- [ ] Web App URL 直接訪問看到 `{"ok":true,"message":"GoWarehouse 分類系統正常運作"}`
- [ ] mobile.html 載入正常,操作員下拉看得到名字
- [ ] 拍一張照,結果出來、紀錄寫入 Sheet
- [ ] admin.html 看得到該筆紀錄

---

## 常見的「跟原作者不同」的踩坑點

### 坑 1:Workspace 帳號 vs 個人 Gmail

如果你 Google 帳號是 **Workspace(公司網域)**,Apps Script 部署的 URL 會多一段 `/a/macros/<公司域名>/`,且員工可能會被公司政策擋掉。
建議用個人 Gmail 帳號做這個專案,避免公司 IT 限制。

### 坑 2:重新部署時要選「新版本」

每次改 `Code.gs` 之後,要去「管理部署作業」按鉛筆編輯,**版本下拉選「新版本」**,然後按部署。如果按「新增部署作業」會建新的 URL,前端會打不到。

### 坑 3:Sheet 分頁名稱不能差一個字

`包裹紀錄`、`類別清單`、`關鍵字快取`、`員工清單` 四個分頁的名稱要 **一字不差**(包含全形/半形空格)。後端是用名字找的,差一個字就找不到。

---

## 你和原作者各自獨立的東西

跑完之後,以下都是你自己的、跟原作者完全無關:

| 項目 | 你自己的 |
| --- | --- |
| API 帳單 | 你的 Anthropic 帳戶儲值,你自己付 |
| Google Sheet | 你的 Google Drive 裡 |
| 員工清單 | 你自己加的人 |
| 包裹紀錄 | 寫進你的 Sheet,原作者看不到 |
| GitHub repo | 你 fork 出來的,原作者只能看 public,改不了你的 |
| Apps Script | 在你的 Google 帳號下執行 |

**唯一共用的是「程式碼結構」**,如果原作者之後修了 bug,你要不要拉新版本看你決定。

---

## 預算抓多少

每天 300 包估算:
- 初期(快取空):約 NT$540–900/月
- 1–2 個月後快取累積:**約 NT$100–200/月**
- 一年總計:約 NT$2000–5000

要更省的話:鼓勵員工用「打字描述」代替「拍照」,因為文字快取命中後完全不打 API。

---

## 遇到問題?

按順序看這三份:

1. **`docs/DEPLOYMENT.md` 「常見錯誤排查」一節** ← 部署過程的錯誤
2. **`docs/TESTING.md` 「五、故障排查決策樹」** ← 上線後的故障
3. **找原作者問** ← 他知道你 fork 自誰,可以協助

祝部署順利。
