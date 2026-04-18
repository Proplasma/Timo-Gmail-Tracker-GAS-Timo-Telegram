// // File: Code.gs
// // --- TIMO TRACKER EMAIL BOT (OPEN SOURCE VERSION) ---
// // Mô tả: Bot tự động quét Email thông báo từ ngân hàng Timo, ghi vào Google Sheets và gửi thông báo qua Telegram.
// Phiên bản này hiển thị số dư tại tin nhắn
const CONFIG = {
  // Thay mã Token nhận từ @BotFather vào đây
  TELEGRAM_TOKEN: 'YOUR_TELEGRAM_BOT_TOKEN_HERE', 
  
  // Thay ID người nhận hoặc Group ID vào đây
  CHAT_ID: 'YOUR_CHAT_ID_HERE', 
  
  SHEET_NAME: 'Giao Dịch',
  LABEL_NAME: 'BOT_DONE',
  SCAN_DURATION_HOURS: 2,
  
  // Email hệ thống gửi thông báo của ngân hàng
  SENDER_EMAIL: 'support@timo.vn' 
};

/**
 * GIAO DIỆN WEB APP (doGet)
 * Hiển thị nhật ký giao dịch dưới dạng bảng trên trình duyệt
 */
function doGet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME) || setupSystem();
    const data = sheet.getDataRange().getValues();
    
    let html = `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background: #f0f2f5; }
            .container { max-width: 1000px; margin: auto; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            h2 { color: #1a1a1a; text-align: center; border-bottom: 2px solid #00b894; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
            th { background-color: #00b894; color: white; text-transform: uppercase; font-size: 14px; }
            tr:hover { background-color: #fafafa; }
            .thu { color: #27ae60; font-weight: bold; }
            .chi { color: #e74c3c; font-weight: bold; }
            .status { font-size: 12px; padding: 4px 8px; border-radius: 4px; background: #dfe6e9; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>📊 Nhật ký Giao dịch</h2>
            <table>
              <thead>
                <tr>${data[0].map(h => `<th>${h}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${data.slice(1).reverse().map(row => `
                  <tr>
                    <td>${row[0]}</td>
                    <td class="${row[1] && row[1].includes('Thu') ? 'thu' : 'chi'}">${row[1]}</td>
                    <td style="font-weight:bold">${Number(row[2]).toLocaleString('vi-VN')} đ</td>
                    <td>${row[3]}</td>
                    <td>${row[4]} đ</td>
                    <td><span class="status">${row[5]}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </body>
      </html>
    `;
    return HtmlService.createHtmlOutput(html).setTitle("Transaction Log");
  } catch (e) {
    return HtmlService.createHtmlOutput("<h1 style='text-align:center; margin-top:50px;'>Hệ thống đang sẵn sàng, vui lòng đợi giao dịch mới...</h1>");
  }
}

/**
 * HÀM KHỞI TẠO (Chạy lần đầu)
 */
function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow(['Thời gian', 'Loại', 'Số tiền', 'Nội dung', 'Số dư', 'Trạng thái']);
    sheet.getRange("A1:F1").setFontWeight("bold").setBackground("#00b894").setFontColor("white");
    sheet.setFrozenRows(1);
  }
  let label = GmailApp.getUserLabelByName(CONFIG.LABEL_NAME) || GmailApp.createLabel(CONFIG.LABEL_NAME);
  console.log("Setup hoàn tất!");
  return sheet;
}

/**
 * QUÉT GMAIL -> GHI SHEET
 */
function scanGmailToSheet() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); 
    setupSystem();
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
    const label = GmailApp.getUserLabelByName(CONFIG.LABEL_NAME);
    const userProperties = PropertiesService.getUserProperties();
    
    const query = `from:${CONFIG.SENDER_EMAIL} newer_than:${CONFIG.SCAN_DURATION_HOURS}h`;
    const threads = GmailApp.search(query);
    
    threads.forEach(thread => {
      const messages = thread.getMessages();
      let hasNewMessageInThread = false;

      messages.forEach(msg => {
        const msgId = msg.getId();
        if (userProperties.getProperty(msgId)) return;

        const body = msg.getPlainBody();
        
        // Regex bóc tách thông tin
        const typeMatch = body.match(/vừa\s+(tăng|giảm)/i);
        const amountMatch = body.match(/(?:tăng|giảm)\s+([\d,.]+)\s*VND/i);
        const timeMatch = body.match(/vào\s+([\d/:\s]+)(?=\.)/);
        const balanceMatch = body.match(/Số dư[^\d]*?([\d,.]+)\s*(?:VND|VNĐ)/i);
        const descMatch = body.match(/Mô tả:\s+([\s\S]*?)(?=\.\s|Cảm ơn)/i);

        if (typeMatch && amountMatch) {
          const typeStr = typeMatch[1].toLowerCase();
          const rawAmount = parseFloat(amountMatch[1].replace(/\./g, '').replace(/,/g, ''));
          const amount = (typeStr === 'giảm') ? -rawAmount : rawAmount;
          
          const time = timeMatch ? timeMatch[1].trim() : msg.getDate().toLocaleString('vi-VN');
          const balance = balanceMatch ? balanceMatch[1].trim() : "0";
          const desc = descMatch ? descMatch[1].trim() : "Giao dịch Bank";

          sheet.appendRow([time, typeStr === 'tăng' ? '➕ Thu' : '➖ Chi', amount, desc, balance, 'Pending']);
          userProperties.setProperty(msgId, 'PROCESSED');
          hasNewMessageInThread = true;
        }
      });

      if (hasNewMessageInThread) {
        thread.addLabel(label);
        thread.markRead();
      }
    });
  } catch (e) { 
    console.log("Lỗi quét Gmail: " + e.toString()); 
  } finally { 
    lock.releaseLock(); 
  }
}

/**
 * GỬI THÔNG BÁO TELEGRAM
 */
function sendTelegramNotifications() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const range = sheet.getRange(2, 1, lastRow - 1, 6);
    const data = range.getValues();

    for (let i = 0; i < data.length; i++) {
      if (data[i][5] === 'Pending') {
        const rowIdx = i + 2;
        const icon = data[i][1].includes('Thu') ? '🟢' : '🔴';
        const msg = `${icon} *BIẾN ĐỘNG SỐ DƯ*\n` +
                    `────────────────\n` +
                    `💰 *Số tiền:* ${data[i][1]} ${Number(data[i][2]).toLocaleString('vi-VN')}đ\n` +
                    `📝 *Nội dung:* ${data[i][3]}\n` +
                    `🏦 *Số dư:* ${data[i][4]}đ\n` +
                    `⏰ *Thời gian:* ${data[i][0]}`;

        if (sendToTelegram(msg)) {
          sheet.getRange(rowIdx, 6).setValue('Sent');
        }
      }
    }
  } catch (e) { 
    console.log("Lỗi Telegram: " + e.toString()); 
  } finally { 
    lock.releaseLock(); 
  }
}

function sendToTelegram(text) {
  if (CONFIG.TELEGRAM_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') return false;
  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`;
  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify({
      'chat_id': CONFIG.CHAT_ID, 
      'text': text, 
      'parse_mode': 'Markdown'
    }),
    'muteHttpExceptions': true
  };
  const response = UrlFetchApp.fetch(url, options);
  return response.getResponseCode() === 200;
}