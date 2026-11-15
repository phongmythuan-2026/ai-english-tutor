# Teacher Emma - AI English Tutor

Ứng dụng gia sư tiếng Anh tương tác bằng giọng nói và webcam, dùng FastAPI,
WebSocket, Gemini Live API và avatar 3D TalkingHead.

## Chạy trên máy

Yêu cầu Python 3.10 trở lên và một Gemini API key.

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Mở `.env`, điền API key lấy từ [Google AI Studio](https://aistudio.google.com/):

```env
GEMINI_API_KEY=your_api_key
```

Khởi động ứng dụng:

```powershell
uvicorn server:app --reload --port 8000
```

Mở <http://localhost:8000> bằng Chrome hoặc Edge, cho phép dùng microphone và
camera, rồi chọn **Bắt đầu gọi**. HTTPS (có sẵn trên Render) là bắt buộc để trình
duyệt cấp quyền camera/micro ngoài `localhost`.

## Deploy online từng bước: GitHub + Render

GitHub lưu mã nguồn; Render chạy backend và trang web. Không dùng GitHub Pages
cho ứng dụng này vì Pages không chạy FastAPI hoặc WebSocket.

### A. Tạo Gemini API key

1. Mở [Google AI Studio](https://aistudio.google.com/) và đăng nhập Google.
2. Vào phần **Get API key** (hoặc **API keys**) và chọn **Create API key**.
3. Chọn Google Cloud project nếu được hỏi, sau đó tạo và sao chép key.
4. Giữ key riêng tư. Không gửi key trong chat, không dán vào mã nguồn, README,
   hoặc commit Git. Chỉ nhập key vào biến môi trường bảo mật của Render.
5. Kiểm tra tài khoản/model Live API có quyền sử dụng và quota phù hợp. Tài khoản
   Google AI Studio có thể áp dụng hạn mức hoặc điều kiện thanh toán riêng.

### B. Tạo dịch vụ Render từ repository

1. Đăng nhập hoặc đăng ký tại [Render](https://render.com/).
2. Mở **Dashboard**, bấm **New +** rồi chọn **Blueprint**.
3. Kết nối GitHub nếu được hỏi cấp quyền. Chọn repository
   `phongmythuan-2026/ai-english-tutor` và nhánh `main`.
4. Render tìm file `render.yaml` trong repository. Xác nhận tạo Blueprint/service
   `ai-english-tutor`.
5. Khi Render hỏi giá trị `GEMINI_API_KEY`, dán key vừa tạo vào ô giá trị bí mật.
   Không thay đổi tên biến. Nếu màn hình tạo Blueprint chưa hỏi key, tiếp tục tạo
   service rồi làm bước C.
6. Bấm **Apply** hoặc **Create Resources** để bắt đầu build và deploy. Render sẽ
   cài các gói trong `requirements.txt` và chạy FastAPI bằng lệnh trong
   `render.yaml`.
7. Mở service `ai-english-tutor`, xem tab **Events** hoặc **Logs**. Chờ trạng
   thái deploy thành **Live**.

**Lưu ý về thẻ thanh toán:** Render có thể yêu cầu thêm thông tin thanh toán để
tiếp tục tạo Blueprint, kể cả khi chọn compute Free. Nếu màn hình yêu cầu thẻ,
đó là yêu cầu xác minh/thanh toán của Render; ảnh chụp màn hình có thể hiển thị
khoản ủy quyền tạm thời $1. Nếu không muốn cung cấp thẻ, dừng ở bước này và dùng
cách chạy thử không cần thẻ bên dưới. Điều kiện của Render có thể thay đổi theo
tài khoản và thời điểm.

### C. Thêm hoặc cập nhật API key trong Render

Nếu chưa nhập key khi tạo Blueprint, hoặc cần thay key:

1. Trong Render Dashboard, mở service `ai-english-tutor`.
2. Chọn **Environment**.
3. Thêm biến với **Key** là `GEMINI_API_KEY`, **Value** là Gemini API key của bạn.
4. Bấm **Save, rebuild, and deploy** (hoặc nút lưu/deploy tương đương) và chờ
   service trở lại trạng thái **Live**. Không cần thêm dấu nháy quanh key.

Biến `GEMINI_LIVE_MODEL` được cấu hình sẵn trong `render.yaml`. Nếu model mặc định
không khả dụng với API key/tài khoản của bạn, đổi giá trị biến này trong phần
**Environment** sang model Live mà tài khoản có quyền dùng, rồi lưu và deploy lại.

### D. Mở trang và thử cuộc gọi

1. Trong trang service Render, bấm URL có dạng
   `https://ai-english-tutor-....onrender.com`.
2. Dùng Chrome hoặc Edge phiên bản mới. Chấp nhận quyền microphone và camera khi
   trình duyệt hỏi. Nếu trước đây đã chặn quyền, bấm biểu tượng khóa cạnh địa chỉ
   trang, mở **Site settings**, cho phép **Camera** và **Microphone**, rồi tải lại.
3. Bấm **Bắt đầu gọi** và nói “Hello Teacher”. Thử nút tắt/bật camera và nút
   kết thúc cuộc gọi.
4. Chỉ gửi ảnh webcam khi camera đang bật. Âm thanh và ảnh được chuyển tới Gemini
   để xử lý cuộc hội thoại; xem thêm mục **Quyền riêng tư** bên dưới.

### Xử lý sự cố nhanh

- **Màn hình báo chưa cấu hình `GEMINI_API_KEY`:** kiểm tra đúng tên biến trong
  **Environment**, lưu và deploy lại.
- **Kết nối thất bại ngay sau khi bấm gọi:** xem **Logs** của Render để biết lỗi
  API key, quyền model, quota hoặc giới hạn tài khoản. Kiểm tra `GEMINI_LIVE_MODEL`
  và thử lại sau khi deploy.
- **Không hỏi quyền camera/micro hoặc không bật được:** mở URL HTTPS của Render,
  không phải URL GitHub; cho phép quyền trong cài đặt trình duyệt.
- **Avatar 3D không tải:** cần kết nối Internet để tải thư viện và mô hình bên
  thứ ba. Giao diện vẫn có thể bắt đầu cuộc gọi khi avatar không tải được.
- **Lần mở đầu chậm:** gói miễn phí của nền tảng hosting có thể tạm ngưng service
  khi ít hoạt động; lần truy cập đầu sau đó sẽ cần chờ service khởi động.

Sau này, mỗi lần push commit mới lên nhánh `main`, Render có thể tự build và
deploy lại service nếu bật auto-deploy.

## Chạy thử online không cần thẻ: Cloudflare Quick Tunnel

Cách này giữ mã nguồn trên GitHub nhưng chạy ứng dụng trên máy Windows của bạn,
rồi tạo một URL HTTPS tạm thời để truy cập từ Internet. Máy tính và hai cửa sổ
Terminal phải luôn mở; URL thay đổi khi tạo lại tunnel. Đây là cách demo/thử
nghiệm, không phải hosting luôn hoạt động.

1. Cài Python, rồi mở PowerShell trong thư mục dự án.
2. Tạo môi trường và cài thư viện:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   Copy-Item .env.example .env
   ```

3. Mở `.env`, điền Gemini API key vào `GEMINI_API_KEY`. Không commit file này.
4. Trong cửa sổ PowerShell thứ nhất, chạy web app:

   ```powershell
   uvicorn server:app --host 0.0.0.0 --port 8000
   ```

5. Cài `cloudflared` theo [hướng dẫn chính thức của Cloudflare](https://developers.cloudflare.com/tunnel/downloads/).
6. Mở cửa sổ PowerShell thứ hai và chạy:

   ```powershell
   cloudflared tunnel --url http://localhost:8000
   ```

7. Mở URL `https://....trycloudflare.com` mà lệnh in ra. Dùng URL này để thử
   camera/microphone; chấp nhận quyền khi trình duyệt hỏi.
8. Khi muốn dừng, nhấn `Ctrl+C` ở cửa sổ chạy `cloudflared` và cửa sổ chạy
   `uvicorn`.

**Bảo mật:** bất kỳ ai biết URL tunnel đều có thể truy cập ứng dụng và có thể
tiêu thụ quota Gemini của bạn. Chỉ gửi URL cho người tin cậy, tắt tunnel ngay
sau khi thử, và không đăng URL công khai. Quick Tunnel có thể bật giới hạn truy
cập email bằng tùy chọn `--allowed-mail`; xem cú pháp hiện hành trong
[tài liệu Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Quyền riêng tư

Âm thanh microphone và ảnh webcam được gửi tới backend rồi chuyển tiếp tới Gemini
để phục vụ cuộc hội thoại. Webcam chỉ gửi ảnh khi đang bật; video preview và xử lý
avatar diễn ra trong trình duyệt.
