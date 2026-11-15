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

## Đưa mã nguồn lên GitHub và deploy Render

1. Đẩy mã nguồn lên repository GitHub. File `.env` đã được loại khỏi Git; không
   đưa API key vào mã nguồn hoặc commit.
2. Trên Render, chọn **New > Blueprint**, kết nối repository này và deploy bằng
   cấu hình `render.yaml`.
3. Nhập `GEMINI_API_KEY` trong phần Environment của dịch vụ Render rồi deploy lại.
4. Mở URL HTTPS do Render cấp. Cả trang web và backend WebSocket chạy trên cùng
   dịch vụ; GitHub Pages không hỗ trợ phần backend/WebSocket này.

Có thể đổi model Live bằng biến môi trường `GEMINI_LIVE_MODEL` nếu model mặc định
không được bật cho API key hoặc tài khoản của bạn.

## Quyền riêng tư

Âm thanh microphone và ảnh webcam được gửi tới backend rồi chuyển tiếp tới Gemini
để phục vụ cuộc hội thoại. Webcam chỉ gửi ảnh khi đang bật; video preview và xử lý
avatar diễn ra trong trình duyệt.
