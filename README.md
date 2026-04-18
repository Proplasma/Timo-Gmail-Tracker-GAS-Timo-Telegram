# Timo-Gmail-Tracker-GAS-Timo-Telegram
Dự án sử dụng Google Apps Script (GAS) để tự động hóa việc theo dõi biến động số dư ngân hàng Timo. Hệ thống sẽ tự động quét email thông báo từ ngân hàng, trích xuất dữ liệu giao dịch, lưu trữ vào Google Sheets và gửi thông báo tức thì đến Telegram.

Cập nhật code phiên bản ẩn hoặc hiện số dư tài khoản, khi dùng bạn chỉ cần copy 1 trong 3 phiên bản tuỳ vào việc bạn muốn bot hiển thị hay không hiển thị số dư trong tin nhắn thôi

Hướng dẫn cài đặt nhanh
Chuẩn bị: Tạo một bot Telegram qua @BotFather để lấy API Token.

Google Sheet: Tạo một file Google Sheet mới và copy ID của file đó.

Triển khai Script:

Truy cập Google Apps Script.

Dán mã nguồn vào dự án mới.

Chạy hàm setupEnvironment() để lưu cấu hình.

Nhấn Deploy dưới dạng Web App để lấy Webhook URL.

Kích hoạt: Chạy hàm AutoSetUpBot() để bắt đầu chế độ tự động hóa.
