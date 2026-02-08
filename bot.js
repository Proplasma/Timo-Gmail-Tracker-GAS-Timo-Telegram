/**
 * ============================================================
 * PHẦN 1: CẤU HÌNH HỆ THỐNG
 * ============================================================
 */

// ID Telegram của bạn (Dùng lệnh /id để lấy)
const ADMIN_CHAT_ID = "THAY_ID_CHAT_CỦA_BẠN_VÀO_ĐÂY"; 

/**
 * HÀM KHỞI CHẠY CHÍNH (Chạy 1 lần duy nhất khi cài đặt)
 */
function AutoSetUpBot() {
  setupEnvironment(); // Lưu cấu hình vào bộ nhớ Script
  setWebhook();       // Kết nối với Telegram
  setupTimeTrigger(); // Cài đặt tự động quét 15 phút/lần
}

function setupEnvironment() {
  const scriptProperties = PropertiesService.getScriptProperties();
  
  scriptProperties.setProperties({
    'BOT_TOKEN': 'DIEN_TOKEN_BOT_CUA_BAN_VAO_DAY', 
    'WEBAPP_URL': 'DIEN_URL_SAU_KHI_DEPLOY_VAO_DAY', 
    'SHEET_ID': 'DIEN_ID_GOOGLE_SHEET_VAO_DAY',      
    
    /**
     * CẤU HÌNH QUÉT GMAIL TỐI ƯU:
     * - newer_than:2d => Chỉ đọc email trong 2 ngày gần nhất (Tránh lag do mail cũ).
     * - -label:BOT_DONE => Bỏ qua những email đã xử lý rồi.
     */
    'GMAIL_QUERY': 'from:support@timo.vn subject:"thông báo thay đổi số dư tài khoản" -label:BOT_DONE newer_than:2d' 
  });
  
  // Tạo nhãn để đánh dấu email đã xử lý
  try { GmailApp.createLabel("BOT_DONE"); } catch(e) {}
  Logger.log("✅ Đã cập nhật cấu hình mới (Giới hạn 2 ngày gần nhất)!");
}

function getConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    token: props.getProperty('BOT_TOKEN'),
    webAppUrl: props.getProperty('WEBAPP_URL'),
    ssId: props.getProperty('SHEET_ID'),
    gmailQuery: props.getProperty('GMAIL_QUERY')
  };
}

/**
 * ============================================================
 * PHẦN 2: LỌC VÀ XỬ LÝ EMAIL
 * ============================================================
 */

function scanEmails() {
  const config = getConfig();
  
  // Chỉ lấy tối đa 10 email mới nhất mỗi lần quét để đảm bảo tốc độ
  const threads = GmailApp.search(config.gmailQuery, 0, 10); 
  
  if (threads.length === 0) return [];

  const ss = SpreadsheetApp.openById(config.ssId);
  const sheet = ss.getSheets()[0];
  let doneLabel = GmailApp.getUserLabelByName("BOT_DONE");
  let newTransactions = [];

  for (const thread of threads) {
    const messages = thread.getMessages();
    // Lấy tin nhắn cuối cùng trong luồng mail
    const message = messages[messages.length - 1]; 
    const body = message.getPlainBody(); 
    
    // Trích xuất dữ liệu bằng Regex
    const amountMatch = body.match(/vừa (tăng|giảm)\s+([\d\.,]+)\s+VND/i);
    const dateMatch = body.match(/vào\s+(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})/);
    const balanceMatch = body.match(/Số dư[\s\S]*?:\s*([\d\.,]+)\s*VND/i);
    const descMatch = body.match(/Mô tả:\s+([\s\S]*?)(?=\n|Cảm ơn)/);

    if (amountMatch && dateMatch) {
      const type = amountMatch[1]; 
      let amount = parseInt(amountMatch[2].replace(/[.,]/g, "")); 
      if (type.toLowerCase() === "giảm") amount = -amount;

      const dateStr = dateMatch[1];
      const desc = descMatch ? descMatch[1].trim() : "Không có mô tả";
      const balance = balanceMatch ? parseInt(balanceMatch[1].replace(/[.,]/g, "")) : 0;

      newTransactions.push({ date: dateStr, amount: amount, desc: desc, balance: balance });

      // Ghi vào dòng cuối cùng của Sheet
      sheet.appendRow([dateStr, amount, desc, balance]);
    }
    // Gắn nhãn ngay lập tức để không quét trùng
    thread.addLabel(doneLabel);
  }
  return newTransactions;
}

/**
 * ============================================================
 * PHẦN 3: TỰ ĐỘNG HÓA VÀ TELEGRAM
 * ============================================================
 */

// Chạy ngầm định kỳ
function autoCheck() {
  const transactions = scanEmails(); 
  
  if (transactions.length > 0) {
    let msg = `🔔 <b>GIAO DỊCH MỚI (${transactions.length})</b>\n\n`;
    
    transactions.forEach(t => {
      const icon = t.amount > 0 ? "🟢" : "🔴";
      const money = new Intl.NumberFormat('vi-VN').format(t.amount);
      const balance = new Intl.NumberFormat('vi-VN').format(t.balance);
      
      msg += `${icon} <b>${money} đ</b>\n`;
      msg += `📝 ${t.desc}\n`;
      msg += `💰 Số dư: ${balance} đ\n`;
      msg += `--------------------\n`;
    });
    
    if (ADMIN_CHAT_ID && ADMIN_CHAT_ID !== "THAY_ID_CHAT_CỦA_BẠN_VÀO_ĐÂY") {
      sendText(ADMIN_CHAT_ID, msg);
    }
  }
}

// Xử lý lệnh từ Telegram nhắn tới
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (!data.message) return;

    const chatId = data.message.chat.id;
    const text = data.message.text;

    if (text === "/scan" || text === "/check") {
      sendText(chatId, "⏳ Đang quét email 48h qua...");
      const transactions = scanEmails();
      if (transactions.length > 0) {
        sendText(chatId, `✅ Đã cập nhật thêm ${transactions.length} giao dịch.`);
      } else {
        sendText(chatId, "📭 Không có giao dịch mới trong 2 ngày qua.");
      }
    } else if (text === "/id") {
      sendText(chatId, `🆔 ID của bạn: <code>${chatId}</code>`);
    } else if (text === "/start") {
      sendText(chatId, "👋 Bot Timo đã sẵn sàng!\n/scan: Quét mail\n/id: Lấy Chat ID");
    }
  } catch (e) {
    Logger.log("Lỗi: " + e.toString());
  }
}

/**
 * PHẦN 4: HÀM TIỆN ÍCH
 */

function sendText(chatId, text) {
  const config = getConfig();
  const url = "https://api.telegram.org/bot" + config.token + "/sendMessage?chat_id=" + chatId + "&parse_mode=HTML&text=" + encodeURIComponent(text);
  UrlFetchApp.fetch(url);
}

function setWebhook() {
  const config = getConfig();
  const url = "https://api.telegram.org/bot" + config.token + "/setWebhook?url=" + config.webAppUrl;
  UrlFetchApp.fetch(url);
}

function setupTimeTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === "autoCheck") {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  ScriptApp.newTrigger("autoCheck").timeBased().everyMinutes(15).create();
}