# 🤖 NSL Bot System — Hướng dẫn cho người mới

> Đọc file này 1 lần là đủ để bắt đầu làm việc cùng nhau mà không bị lộn xộn.
> Hãy bắt agent hỏi tên gì (ví dụ Khôi Nguyên, Blobs, Sharkie) để agent biết được bạn đang làm bot nào.

**Team:**
| Người | Bot phụ trách |
|---|---|
| **Khôi Nguyên** | Summary, Reminder, Translator |
| **Blobs** | Backup, Content |
| **Sharkie** | Payroll, Recruiting, Content |

---

## 1. Chúng ta dùng GitHub để làm việc chung

**Tại sao không dùng Google Drive hay gửi file qua Zalo?**
Vì code thay đổi liên tục. Nếu dùng Google Drive, 3 người sẽ ghi đè lên nhau và mất code của nhau. **GitHub ghi nhớ toàn bộ lịch sử thay đổi**, ai sửa gì, lúc nào, tại sao — và có thể khôi phục lại bất kỳ lúc nào.

**Hình dung đơn giản:**
- GitHub = Google Drive NHƯNG thông minh hơn, dành riêng cho code
- Mỗi lần bạn "lưu" code lên GitHub = gọi là **commit**
- Lấy code mới nhất của người khác về máy = gọi là **pull**
- Đẩy code của mình lên = gọi là **push**

---

## 2. Cài đặt lần đầu (chỉ làm 1 lần)

### Bước 1: Cài Git
Tải về và cài đặt tại: **https://git-scm.com/downloads**
(Bấm Next liên tục, không cần thay đổi gì)

### Bước 2: Đặt tên của bạn vào Git (quan trọng!)
Cả team dùng chung 1 tài khoản GitHub công ty, nên mỗi người phải tự đặt tên mình vào Git trên máy cá nhân để mọi người biết ai commit gì.

Mở terminal và gõ (thay bằng tên + email của bạn):
```bash
git config --global user.name "Tên của bạn"
git config --global user.email "email@nslclick.com"
```

Ví dụ:
```bash
# Khôi Nguyên — gõ trên máy của Khôi
git config --global user.name "KhoiNguyen"
git config --global user.email "khoi.nguyen@new-solution.eu"

# Blobs — gõ trên máy của Blobs
git config --global user.name "Blobs"
git config --global user.email "duy.nguyen@new-solution.eu"

# Sharkie — gõ trên máy của Sharkie
git config --global user.name "Sharkie"
git config --global user.email "tien.nguyen@new-solution.eu"
```

Sau đó, lịch sử commit sẽ hiển thị đúng tên từng người, dù cùng 1 tài khoản GitHub:
```
[ops] fix deadline bug        — Blobs, 2 hours ago
[comms] add /summary command  — KhoiNguyen, 5 hours ago
[growth] add CV screener      — Sharkie, yesterday
```

### Bước 3: Lấy code về máy
Khôi Nguyên sẽ gửi link repo. Mở terminal và gõ:
```bash
git clone https://github.com/NSLClickWork/nsl-100-bot.git
cd nsl-100-bot
```

Xong. Toàn bộ code đã nằm trên máy bạn.

---

## 3. Cấu trúc thư mục — Ai làm chỗ nào

```
nsl-bot/
│
├── shared/          ← CODE DÙNG CHUNG — đọc được, KHÔNG tự ý sửa
│   ├── ai/          → Gọi AI (Groq, OpenAI)
│   ├── data/        → Đọc Google Drive, Outlook, SharePoint
│   └── utils/       → Airtable, tiện ích chung
│
├── khoi/            ← KHÔI NGUYÊN (Summary, Reminder, Translator)
│   └── src/modules/
│       ├── summary.js
│       ├── reminder.js
│       └── translator.js
│
├── blobs/           ← BLOBS (Backup, Content)
│   └── src/modules/
│       ├── backup.js
│       └── content.js
│
└── sharkie/         ← SHARKIE (Payroll, Recruiting, Content)
    └── src/modules/
        ├── payroll.js
        ├── recruiting.js
        └── content.js
```

### Quy tắc đơn giản:
- ✅ Bạn tự do sửa folder **của mình**
- ✅ Bạn được **đọc** code của người khác để học cách viết
- ❌ **KHÔNG tự ý sửa** folder của người khác hoặc `shared/` mà chưa báo

| Folder | Chủ sở hữu | Được phép sửa |
|---|---|---|
| `khoi/` | Khôi Nguyên | Chỉ Khôi Nguyên |
| `blobs/` | Blobs | Chỉ Blobs |
| `sharkie/` | Sharkie | Chỉ Sharkie |
| `shared/` | Cả team | Phải hỏi cả nhóm trước |

---

## 4. Làm việc mỗi ngày — 4 lệnh cần nhớ

```bash
# Buổi sáng — lấy code mới nhất của đồng đội về
git pull

# Trong ngày — sau khi sửa xong một tính năng
git add .
git commit -m "[blobs] thêm tính năng backup"       # Blobs
git commit -m "[khoi] thêm lệnh /summary"           # Khôi Nguyên
git commit -m "[sharkie] thêm lọc CV tự động"       # Sharkie
git push
```

**Chỉ vậy thôi.** 4 lệnh này là 90% những gì bạn cần dùng mỗi ngày.

---

## 5. Viết commit message đúng cách

Format bắt buộc: `[tên-process] mô tả ngắn bằng tiếng Anh`

```bash
# ✅ Đúng
git commit -m "[blobs] fix backup timezone bug"              # Blobs
git commit -m "[khoi] add /summary slash command"            # Khôi Nguyên
git commit -m "[shared] add Microsoft Graph auth"            # ai cũng được
git commit -m "[sharkie] WIP: recruiting CV screener"        # Sharkie

# ❌ Sai — không biết ai làm gì
git commit -m "fix bug"
git commit -m "update"
git commit -m "done"
```

Lý do: nhìn vào lịch sử là biết ngay ai làm gì, không cần hỏi.

---

## 6. Khi muốn sửa code trong `shared/`

Vì `shared/` ảnh hưởng đến **cả 3 người**, bạn phải:

1. Nhắn vào kênh `#🔧-bot-dev` trên Discord: "Mình cần sửa `shared/ai/engine.js` để thêm X — có ảnh hưởng đến ai không?"
2. Đợi 2 người kia phản hồi (xác nhận không bị ảnh hưởng)
3. Sửa xong, thông báo lại: "Đã push, hàm `summarizeText()` giờ có thêm param `maxTokens`"

---

## 7. Xử lý khi bị conflict (2 người cùng sửa 1 file)

Đây là trường hợp hiếm gặp nếu ai giữ đúng folder của mình. Nhưng nếu xảy ra, Git sẽ báo:
```
CONFLICT (content): Merge conflict in khoi/src/modules/reminder.js
```

**Không cần hoảng loạn.** Nhắn cho Khôi Nguyên, 2 người mở file đó lên và chọn giữ đoạn code nào. Git có hướng dẫn rõ ràng trong file bị conflict.

---

## 8. Quy tắc thiết kế Bot (RẤT QUAN TRỌNG)

Vì đa số nhân sự công ty là người dùng low-tech (không rành công nghệ), **họ sẽ không thể nhớ các lệnh (Slash Commands)**. Do đó, MỌI tính năng khi thiết kế đều phải tuân thủ quy tắc sau:

1. **Sử dụng Nút bấm (Buttons):** Tuyệt đối không bắt người dùng tự gõ lệnh dài dòng. Mọi thao tác từ tạo yêu cầu, xem báo cáo, đến duyệt đơn đều phải là các nút bấm trực quan.
2. **Tạo Pinned Dashboard (Bảng điều khiển):** Mỗi bot phải tạo ra một tin nhắn chứa toàn bộ các nút bấm điều khiển của nó. Tin nhắn này sẽ được ghim (pin) vĩnh viễn ở đầu kênh làm việc chung để bất kỳ ai vào kênh cũng thấy và bấm được ngay.
3. **Slash Commands chỉ để hỗ trợ:** Lệnh gõ tay (ví dụ `/summary`) chỉ dùng như phương án dự phòng, phím tắt nhanh cho dev, hoặc dùng để *gọi* ra cái bảng điều khiển (Dashboard) lần đầu tiên.

*(Mục tiêu: Đảm bảo tối ưu hóa UI/UX thân thiện nhất, bấm là chạy, không cần học lệnh)*

---

## 9. Bảng quy ước nhanh

| Thứ | Quy ước |
|---|---|
| Ngôn ngữ trong code | **English** (tên hàm, comment, log, message gửi user) |
| Ngôn ngữ chat nhóm | Tiếng Việt thoải mái |
| Múi giờ cron job | Luôn viết theo **UTC** (11h VN = `0 4 * * *` UTC) |
| Tên slash command Discord | `/snake_case` không dấu (VD: `/check_deadlines`) |
| Tên cột Airtable | `Pascal_Case` (VD: `Task_Name`, `Assignee_Slack_ID`) |
| Tên file | `snake_case.js` (VD: `morning_brief.js`) |

---

## 10. Ngày đầu tiên — checklist

- [ ] Cài Git tại https://git-scm.com/downloads
- [ ] Mở terminal, chạy lệnh đặt tên:
  ```bash
  git config --global user.name "Tên của bạn"
  git config --global user.email "email@nslclick.com"
  ```
- [ ] Nhận link repo + thông tin tài khoản GitHub công ty từ Khoi
- [ ] Chạy `git clone [link]` để lấy code về máy
- [ ] Nhận nội dung file `.env` qua DM từ Khoi → tạo file `.env` trong folder của mình (không bao giờ commit file này)
- [ ] Chạy `npm install` trong folder của mình
- [ ] Chạy `node index.js` → thấy bot online trên Discord test server là thành công 🎉

---

## 11. Câu hỏi thường gặp

**Q: Lỡ push code lỗi thì sao?**
A: Không sao cả. Git giữ lịch sử, Khoi có thể rollback về bản trước trong 30 giây.

**Q: Mình không biết cách viết một tính năng thì hỏi ai?**
A: Hỏi trong `#🔧-bot-dev` trên Discord. Hoặc đọc code trong `shared/` và folder của người khác để học cách họ làm.

**Q: File `.env` là gì, có được commit lên không?**
A: `.env` chứa mật khẩu và API key của bot. **TUYỆT ĐỐI không commit lên GitHub.** File này đã được thêm vào `.gitignore` rồi nên Git sẽ tự bỏ qua nó.

**Q: Mình không hiểu Git, có video nào xem không?**
A: YouTube "Git và GitHub cho người mới bắt đầu" — xem 1 video 15 phút là đủ dùng.

---

*File này do Khôi Nguyên viết và cập nhật. Có thắc mắc → nhắn thẳng vào `#🔧-bot-dev`.*
