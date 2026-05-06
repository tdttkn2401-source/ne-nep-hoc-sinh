# Webapp Quản lí nề nếp học sinh

Bản React + Firebase gồm các chức năng:

1. Đăng nhập Admin / Giáo viên
2. Admin tạo lớp, thêm học sinh
3. Admin tạo danh mục lỗi nề nếp
4. Giáo viên nhập lỗi cho học sinh
5. Thống kê lớp 7B / toàn trường
6. Xuất báo cáo Excel / PDF
7. Đưa lên Vercel hoặc Firebase Hosting

## 1. Cài đặt và chạy local

Mở PowerShell tại thư mục dự án rồi chạy:

```bash
npm install
npm run dev
```

Sau đó mở đường link Vite hiện ra, thường là:

```bash
http://localhost:5173
```

## 2. Cấu hình Firebase

Tạo file `.env` từ file mẫu:

```bash
copy .env.example .env
```

Mở file `.env`, dán Firebase config của bạn vào các dòng sau:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_ADMIN_INVITE_CODE=ADMIN2026
```

Trong Firebase Console, cần bật:

- Authentication → Sign-in method → Email/Password
- Firestore Database → Create database

## 3. Tạo tài khoản ban đầu

- Tài khoản đầu tiên đăng ký trong app sẽ tự là Admin.
- Các tài khoản sau mặc định là Giáo viên.
- Admin có thể vào mục **Tài khoản** để đổi quyền và gán lớp.

Lưu ý: Nếu đưa vào dùng thật, nên tạo Admin thủ công trong Firestore và bỏ cơ chế mã admin ở frontend.

## 4. Quy trình dùng app

### Admin

1. Vào **Lớp học** → tạo lớp, ví dụ: 7B.
2. Vào **Học sinh** → thêm học sinh hoặc nhập nhanh danh sách.
3. Vào **Danh mục lỗi** → tạo lỗi hoặc bấm tạo bộ lỗi mẫu.
4. Vào **Tài khoản** → gán giáo viên vào lớp được phân công.

### Giáo viên

1. Đăng nhập bằng tài khoản giáo viên.
2. Vào **Nhập lỗi**.
3. Chọn ngày, lớp, học sinh, lỗi nề nếp, ghi chú.
4. Vào **Thống kê** để xem báo cáo.

## 5. Xuất Excel / PDF

Trong mục **Thống kê**:

- Bấm **Xuất Excel** để tải file `.xlsx`.
- Bấm **Xuất PDF** → trình duyệt mở trang báo cáo → chọn **In / Lưu PDF**.

Cách PDF này giữ font tiếng Việt tốt hơn so với xuất PDF trực tiếp bằng thư viện.

## 6. Deploy lên Vercel

```bash
npm run build
npm install -g vercel
vercel
```

## 7. Deploy lên Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
npm run build
firebase deploy
```

Khi `firebase init hosting`, chọn:

- Public directory: `dist`
- Configure as a single-page app: `Yes`
- Overwrite index.html: `No`

## 8. Firestore rules

File `firestore.rules` đã có sẵn. Khi deploy rules:

```bash
firebase deploy --only firestore:rules
```

## 9. Ghi chú bảo mật

Bản này phù hợp để chạy thử và dùng nội bộ nhà trường. Nếu triển khai chính thức, nên:

- Tạo Admin thủ công trong Firestore.
- Không để mã admin trong frontend.
- Ràng buộc giáo viên chỉ được tạo vi phạm ở lớp được phân công bằng Firestore rules nâng cao.
- Bổ sung sao lưu dữ liệu định kỳ.
