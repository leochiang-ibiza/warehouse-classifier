/**
 * GoWarehouse 包裹分類系統 - Apps Script 後端
 * ----------------------------------------------------------------------------
 * 一次性設定流程:
 *   1. 把這支 Code.gs 完整貼進 Apps Script 編輯器
 *   2. 在下方 setupApiKeys() 函式中替換三個 YOUR_xxx_HERE
 *   3. 在編輯器選擇函式 setupApiKeys 並執行(只要做這一次)
 *   4. 部署 → 新增部署 → 類型「網頁應用程式」
 *      - 執行身分:我
 *      - 存取權:任何人
 *   5. 複製 Web App URL,填到 mobile.html / admin.html 的 API_URL 變數
 * ----------------------------------------------------------------------------
 * 前端呼叫格式(POST,Content-Type: text/plain;charset=utf-8):
 *   body = JSON.stringify({ action: 'classify', description: '...' })
 *   後端統一回傳 { ok: true/false, ... }
 * ----------------------------------------------------------------------------
 */


// ============================================================================
// 一、設定區
// ============================================================================

const SHEET_NAMES = {
  RECORDS:    '包裹紀錄',
  CATEGORIES: '類別清單',
  CACHE:      '關鍵字快取',
  EMPLOYEES:  '員工清單'
};

// 用於 AI 呼叫的模型 ID
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

// 包裹紀錄欄位順序(改 Sheet 欄位的話這裡要同步改)
const RECORD_COL = {
  TIME: 1, PACKAGE: 2, DESC: 3, CATEGORY: 4, CONFIDENCE: 5, SOURCE: 6, OPERATOR: 7
};


// ============================================================================
// 二、一次性金鑰寫入
// ----------------------------------------------------------------------------
// 替換下方三個值之後,在編輯器執行 setupApiKeys 一次。
// 之後 Key 就會存在 PropertiesService 裡,不會出現在程式碼,
// 你可以放心把 Code.gs 推到 GitHub 不怕外洩。
// ============================================================================

function setupApiKeys() {
  PropertiesService.getScriptProperties().setProperties({
    'CLAUDE_API_KEY': 'YOUR_CLAUDE_API_KEY_HERE',   // ← 替換成你的 Claude Key
    'SHEET_ID':       'YOUR_GOOGLE_SHEET_ID_HERE'   // ← 替換成你的 Sheet ID
  });
  Logger.log('✅ 金鑰已寫入 PropertiesService。可以執行 verifySetup() 確認設定正確。');
}

function verifySetup() {
  const props = PropertiesService.getScriptProperties();
  const checks = ['CLAUDE_API_KEY', 'SHEET_ID'];
  const result = {};
  checks.forEach(k => {
    const v = props.getProperty(k);
    result[k] = v ? `已設定(${v.length} 字元)` : '❌ 未設定';
  });

  // 檢查 Sheet 是否能開、4 個分頁是否齊全
  try {
    const ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
    Object.values(SHEET_NAMES).forEach(name => {
      result[`分頁 [${name}]`] = ss.getSheetByName(name) ? '✅' : '❌ 找不到';
    });
  } catch (err) {
    result['Sheet 開啟'] = '❌ ' + err.message;
  }

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function getProp(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error(`缺少 ${key},請先執行 setupApiKeys()`);
  return v;
}

function getSheet(name) {
  return SpreadsheetApp.openById(getProp('SHEET_ID')).getSheetByName(name);
}


// ============================================================================
// 三、Web App 入口:doPost 路由表
// ============================================================================

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    let result;

    switch (action) {
      case 'classify':       result = handleClassify(body); break;
      case 'classifyImage':  result = handleClassifyImage(body); break;
      case 'submit':         result = handleSubmit(body); break;
      case 'getEmployees':   result = { employees: getEmployees() }; break;
      case 'getCategories':  result = { categories: getCategories() }; break;
      case 'getRecords':     result = { records: getRecords(body.filters || {}) }; break;
      case 'updateRecord':   result = handleUpdateRecord(body); break;
      case 'addCategory':    result = handleAddCategory(body); break;
      case 'updateCategory': result = handleUpdateCategory(body); break;
      case 'deleteCategory': result = handleDeleteCategory(body); break;
      case 'addEmployee':    result = handleAddEmployee(body); break;
      case 'toggleEmployee': result = handleToggleEmployee(body); break;
      case 'getStats':       result = getStats(); break;
      default: throw new Error('未知 action:' + action);
    }
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    Logger.log('❌ doPost 錯誤:' + err.message + '\n' + err.stack);
    return jsonResponse({ ok: false, error: err.message });
  }
}

function doGet() {
  return jsonResponse({ ok: true, message: 'GoWarehouse 分類系統正常運作' });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ============================================================================
// 四、分類核心
//   文字分類:快取 → Claude
//   圖片分類:直接 Claude(每張圖都不同,沒法走快取)
// ============================================================================

function handleClassify(body) {
  const description = String(body.description || '').trim();
  if (!description) throw new Error('商品描述不能為空');

  // Layer 1:快取(零成本)
  const cacheHit = lookupCache(description);
  if (cacheHit) {
    return {
      category:   cacheHit.category,
      confidence: 1.0,
      source:     '快取',
      keyword:    cacheHit.keyword
    };
  }

  // Layer 2:Claude
  try {
    const r = classifyWithClaude(description);
    if (r && r.category) return Object.assign(r, { source: 'Claude' });
  } catch (err) {
    Logger.log('❌ Claude 失敗:' + err.message);
  }
  return { category: '未分類', confidence: 0, source: '失敗', keyword: '' };
}


function handleClassifyImage(body) {
  const imageBase64 = String(body.imageBase64 || '');
  const mediaType   = String(body.mediaType || 'image/jpeg');
  if (!imageBase64) throw new Error('沒收到圖片');

  try {
    const r = classifyImageWithClaude(imageBase64, mediaType);
    if (r && r.category) return Object.assign(r, { source: 'Claude(圖)' });
  } catch (err) {
    Logger.log('❌ Claude 圖片判斷失敗:' + err.message);
  }
  return { category: '未分類', confidence: 0, source: '失敗', keyword: '' };
}


/** 在快取中找「描述包含某個關鍵字」的紀錄,取最長關鍵字命中。 */
function lookupCache(description) {
  const sheet = getSheet(SHEET_NAMES.CACHE);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;

  const desc = description.toLowerCase();
  const candidates = [];
  for (let i = 1; i < data.length; i++) {
    const keyword = data[i][0];
    if (!keyword) continue;
    const k = String(keyword).toLowerCase();
    if (k && desc.indexOf(k) !== -1) {
      candidates.push({
        keyword:  String(keyword),
        category: String(data[i][1] || ''),
        hits:     Number(data[i][2]) || 0,
        row:      i + 1
      });
    }
  }
  if (candidates.length === 0) return null;

  // 取最長關鍵字優先,避免「機」誤判「3C 電子」
  candidates.sort((a, b) => b.keyword.length - a.keyword.length);
  const hit = candidates[0];

  // 命中次數 +1
  sheet.getRange(hit.row, 3).setValue(hit.hits + 1);
  return hit;
}


function classifyWithClaude(description) {
  const prompt = buildClassifyPrompt(description, getCategories());
  const text = callClaude([{ type: 'text', text: prompt }]);
  return parseAIResponse(text);
}


function classifyImageWithClaude(imageBase64, mediaType) {
  const prompt = buildImagePrompt(getCategories());
  const text = callClaude([
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
    { type: 'text', text: prompt }
  ]);
  return parseAIResponse(text);
}


/** 把 messages.content 陣列送給 Claude,回傳純文字 */
function callClaude(content) {
  const apiKey = getProp('CLAUDE_API_KEY');
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: content }]
    }),
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  if (code !== 200) {
    throw new Error(`Claude HTTP ${code}:${res.getContentText().slice(0, 300)}`);
  }
  const data = JSON.parse(res.getContentText());
  return (data.content && data.content[0]) ? data.content[0].text : '';
}


function buildClassifyPrompt(description, categories) {
  const list = categories.map(c =>
    `- ${c.code}:${c.name}${c.location ? '(位置:' + c.location + ')' : ''}`
  ).join('\n');

  return `你是台灣倉儲業 GoWarehouse 的包裹分類助手。
請根據商品描述,從以下類別中選一個最符合的代碼。

可用類別:
${list}

商品描述:「${description}」

請只回傳純 JSON(不要加 markdown、不要加說明文字),格式如下:
{"category":"類別代碼","confidence":0~1之間的數字,"keyword":"從描述中萃取的1~6字代表關鍵字,用於未來快取比對"}

如果完全無法判斷,category 填 "未分類",confidence 填 0,keyword 填空字串。`;
}


function buildImagePrompt(categories) {
  const list = categories.map(c =>
    `- ${c.code}:${c.name}${c.location ? '(位置:' + c.location + ')' : ''}`
  ).join('\n');

  return `你是台灣倉儲業 GoWarehouse 的包裹分類助手。
這張照片是一個淘寶包裹的外觀(可能拍到外箱印的商品名、品牌、商品本身)。
請從以下類別中選一個最符合的代碼。

可用類別:
${list}

請只回傳純 JSON(不要加 markdown、不要加說明文字),格式如下:
{"category":"類別代碼","confidence":0~1之間的數字,"keyword":"從圖片辨識到的1~6字代表關鍵字(優先取品牌名或商品名),用於未來文字快取比對"}

如果完全無法判斷,category 填 "未分類",confidence 填 0,keyword 填空字串。`;
}


function parseAIResponse(text) {
  let cleaned = String(text || '').trim();
  // 去掉 ```json ... ``` 標記(Claude 偶爾會加)
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  try {
    const obj = JSON.parse(cleaned);
    return {
      category:   String(obj.category || '未分類'),
      confidence: Number(obj.confidence) || 0,
      keyword:    String(obj.keyword || '')
    };
  } catch (err) {
    Logger.log('⚠️ AI 回傳無法解析為 JSON,原文:' + text);
    return { category: '未分類', confidence: 0, keyword: '' };
  }
}


// ============================================================================
// 五、寫入紀錄 + 自我學習
// ============================================================================

function handleSubmit(body) {
  const packageNumber = String(body.packageNumber || '').trim();
  const operator = String(body.operator || '').trim();
  if (!packageNumber) throw new Error('包裹編號不能為空');
  if (!operator)      throw new Error('未選擇操作員');

  const sheet = getSheet(SHEET_NAMES.RECORDS);
  sheet.appendRow([
    new Date(),
    packageNumber,
    String(body.description || ''),
    String(body.category || '未分類'),
    Number(body.confidence) || 0,
    String(body.source || ''),
    operator
  ]);

  // 來自 AI 的成功命中 → 自動學習關鍵字
  const src = String(body.source || '');
  const isAI = src.indexOf('Claude') === 0;
  if (isAI && body.keyword && body.category && body.category !== '未分類') {
    learnKeyword(body.keyword, body.category);
  }
  return { savedAt: new Date().toISOString() };
}


function learnKeyword(keyword, category) {
  const k = String(keyword).trim();
  if (!k) return;
  const sheet = getSheet(SHEET_NAMES.CACHE);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === k.toLowerCase()) {
      sheet.getRange(i + 1, 2).setValue(category);
      sheet.getRange(i + 1, 3).setValue((Number(data[i][2]) || 0) + 1);
      return;
    }
  }
  sheet.appendRow([k, category, 1]);
}


// ============================================================================
// 六、主管端:讀取、修正、管理
// ============================================================================

function getRecords(filters) {
  const sheet = getSheet(SHEET_NAMES.RECORDS);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const tz = Session.getScriptTimeZone();
  const records = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    const t = row[0] instanceof Date ? row[0] : new Date(row[0]);
    records.push({
      rowId:         i + 1,
      time:          t.toISOString(),
      timeDisplay:   Utilities.formatDate(t, tz, 'MM/dd HH:mm:ss'),
      packageNumber: String(row[1] || ''),
      description:   String(row[2] || ''),
      category:      String(row[3] || ''),
      confidence:    Number(row[4]) || 0,
      source:        String(row[5] || ''),
      operator:      String(row[6] || '')
    });
  }

  let result = records;
  if (filters.operator)  result = result.filter(r => r.operator === filters.operator);
  if (filters.category)  result = result.filter(r => r.category === filters.category);
  if (filters.startDate) {
    const s = new Date(filters.startDate);
    result = result.filter(r => new Date(r.time) >= s);
  }
  if (filters.endDate) {
    const e = new Date(filters.endDate);
    result = result.filter(r => new Date(r.time) <= e);
  }
  if (filters.todayOnly) {
    const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    result = result.filter(r =>
      Utilities.formatDate(new Date(r.time), tz, 'yyyy-MM-dd') === today
    );
  }
  if (filters.limit) result = result.slice(0, filters.limit);

  // 倒序(最新在前)
  result.sort((a, b) => new Date(b.time) - new Date(a.time));
  return result;
}


/**
 * 主管修正分類:把「包裹紀錄」該列的類別改掉,並反向更新快取。
 * 反向更新邏輯:把「描述中所有命中的快取關鍵字」的類別改成新類別。
 * 注意:這個邏輯偏激進(可能影響其他描述)。
 *      如果發現它把不該改的關鍵字也改了,可手動在「關鍵字快取」分頁修正。
 */
function handleUpdateRecord(body) {
  const rowId = Number(body.rowId);
  const newCategory = String(body.newCategory || '').trim();
  if (!rowId || !newCategory) throw new Error('rowId 與 newCategory 必填');

  const sheet = getSheet(SHEET_NAMES.RECORDS);
  sheet.getRange(rowId, RECORD_COL.CATEGORY).setValue(newCategory);
  sheet.getRange(rowId, RECORD_COL.SOURCE).setValue('人工');

  // 反向更新快取
  const description = sheet.getRange(rowId, RECORD_COL.DESC).getValue();
  if (description) {
    reverseLearnFromCorrection(String(description), newCategory);
  }
  return { updated: true };
}


function reverseLearnFromCorrection(description, newCategory) {
  const sheet = getSheet(SHEET_NAMES.CACHE);
  const data = sheet.getDataRange().getValues();
  const desc = description.toLowerCase();
  let updated = 0;

  for (let i = 1; i < data.length; i++) {
    const keyword = data[i][0];
    if (!keyword) continue;
    if (desc.indexOf(String(keyword).toLowerCase()) !== -1) {
      sheet.getRange(i + 1, 2).setValue(newCategory);
      updated++;
    }
  }
  Logger.log(`反向更新快取:${updated} 筆關鍵字改為 ${newCategory}`);
}


// ============================================================================
// 七、類別與員工管理
// ============================================================================

function getCategories() {
  const sheet = getSheet(SHEET_NAMES.CATEGORIES);
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const [code, name, location] = data[i];
    if (!code) continue;
    list.push({
      code:     String(code),
      name:     String(name || ''),
      location: String(location || '')
    });
  }
  return list;
}

function getEmployees() {
  const sheet = getSheet(SHEET_NAMES.EMPLOYEES);
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const [name, active] = data[i];
    if (!name) continue;
    const isActive = (active === true) ||
      ['true', '是', 'y', 'yes', '1'].indexOf(String(active).toLowerCase()) !== -1;
    list.push({ name: String(name), active: isActive });
  }
  return list;
}

function handleAddCategory(body) {
  const code = String(body.code || '').trim();
  const name = String(body.name || '').trim();
  const location = String(body.location || '').trim();
  if (!code || !name) throw new Error('類別代碼與名稱不能為空');

  const sheet = getSheet(SHEET_NAMES.CATEGORIES);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === code) throw new Error('類別代碼已存在:' + code);
  }
  sheet.appendRow([code, name, location]);
  return { added: true };
}

function handleUpdateCategory(body) {
  const code = String(body.code || '').trim();
  const sheet = getSheet(SHEET_NAMES.CATEGORIES);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === code) {
      sheet.getRange(i + 1, 2).setValue(String(body.name || ''));
      sheet.getRange(i + 1, 3).setValue(String(body.location || ''));
      return { updated: true };
    }
  }
  throw new Error('找不到類別:' + code);
}

function handleDeleteCategory(body) {
  const code = String(body.code || '').trim();
  const sheet = getSheet(SHEET_NAMES.CATEGORIES);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === code) {
      sheet.deleteRow(i + 1);
      return { deleted: true };
    }
  }
  throw new Error('找不到類別:' + code);
}

function handleAddEmployee(body) {
  const name = String(body.name || '').trim();
  if (!name) throw new Error('員工姓名不能為空');

  const sheet = getSheet(SHEET_NAMES.EMPLOYEES);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === name) throw new Error('員工已存在:' + name);
  }
  sheet.appendRow([name, true]);
  return { added: true };
}

function handleToggleEmployee(body) {
  const name = String(body.name || '').trim();
  const active = body.active === true;
  const sheet = getSheet(SHEET_NAMES.EMPLOYEES);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === name) {
      sheet.getRange(i + 1, 2).setValue(active);
      return { updated: true };
    }
  }
  throw new Error('找不到員工:' + name);
}


// ============================================================================
// 八、統計
// ============================================================================

function getStats() {
  const sheet = getSheet(SHEET_NAMES.RECORDS);
  const data = sheet.getDataRange().getValues();
  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  const byCategory = {};
  const byOperator = {};
  const bySource = {};
  let total = 0;

  for (let i = 1; i < data.length; i++) {
    const t = data[i][0];
    if (!t) continue;
    const d = t instanceof Date ? t : new Date(t);
    if (Utilities.formatDate(d, tz, 'yyyy-MM-dd') !== today) continue;

    total++;
    const cat = String(data[i][3] || '未分類');
    const op  = String(data[i][6] || '未知');
    const src = String(data[i][5] || '未知');
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    byOperator[op]  = (byOperator[op]  || 0) + 1;
    bySource[src]   = (bySource[src]   || 0) + 1;
  }
  return { date: today, total, byCategory, byOperator, bySource };
}


// ============================================================================
// 九、測試函式(在編輯器選擇函式名稱直接執行,結果看 Logger)
// ============================================================================

function testClassify() {
  Logger.log(JSON.stringify(handleClassify({ description: '兒童玩具汽車' }), null, 2));
}

function testClassifyShoes() {
  Logger.log(JSON.stringify(handleClassify({ description: 'Nike 男款運動鞋 27 公分' }), null, 2));
}

function testClaude() {
  Logger.log(JSON.stringify(classifyWithClaude('運動鞋'), null, 2));
}

function testGetCategories() {
  Logger.log(JSON.stringify(getCategories(), null, 2));
}

function testGetEmployees() {
  Logger.log(JSON.stringify(getEmployees(), null, 2));
}

function testStats() {
  Logger.log(JSON.stringify(getStats(), null, 2));
}

function testFullFlow() {
  // 模擬一次完整流程:分類 + 寫入
  const cls = handleClassify({ description: '兒童玩具汽車' });
  Logger.log('分類結果:' + JSON.stringify(cls));
  const submit = handleSubmit({
    packageNumber: 'TEST-' + new Date().getTime(),
    description: '兒童玩具汽車',
    category: cls.category,
    confidence: cls.confidence,
    source: cls.source,
    keyword: cls.keyword,
    operator: '測試員'
  });
  Logger.log('寫入結果:' + JSON.stringify(submit));
}
