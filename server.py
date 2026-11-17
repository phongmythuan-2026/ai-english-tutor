import asyncio
import base64
import binascii
import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from google import genai
from google.genai import types


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

app = FastAPI(title="Teacher Emma - AI English Tutor")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

SYSTEM_INSTRUCTION = """
You are Teacher Emma, a cheerful, warm, and patient native English teacher
video-calling a child aged 6-12.
- Keep every response very short: one or two simple sentences.
- If you can see an object, drawing, or toy, comment on it and ask a simple question.
- Gently model correct English without lecturing.
- Always end with an easy, fun question.
"""
MAX_MESSAGE_BYTES = 2 * 1024 * 1024


@app.get("/")
async def get_index():
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        await websocket.send_json(
            {"type": "error", "message": "Teacher Emma chưa được cấu hình GEMINI_API_KEY."}
        )
        await websocket.close(code=1011)
        return

    client = genai.Client(
        api_key=api_key,
        http_options={"api_version": "v1beta"},
    )
    config = types.LiveConnectConfig(
        response_modalities=[types.Modality.AUDIO],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
            )
        ),
        system_instruction=types.Content(
            parts=[types.Part.from_text(text=SYSTEM_INSTRUCTION)]
        ),
    )
    model = os.getenv("GEMINI_LIVE_MODEL", "gemini-3.8-live")

    try:
        async with client.aio.live.connect(model=model, config=config) as session:

            async def receive_from_browser():
                while True:
                    raw_message = await websocket.receive_text()
                    try:
                        message = json.loads(raw_message)
                    except json.JSONDecodeError:
                        await websocket.send_json(
                            {"type": "error", "message": "Dữ liệu gửi lên không hợp lệ."}
                        )
                        continue

                    message_type = message.get("type")
                    if message_type not in ("audio", "video"):
                        continue

                    encoded_data = message.get("data")
                    if not isinstance(encoded_data, str):
                        continue
                    try:
                        payload = base64.b64decode(encoded_data, validate=True)
                    except (binascii.Error, ValueError):
                        await websocket.send_json(
                            {"type": "error", "message": "Dữ liệu âm thanh/hình ảnh không hợp lệ."}
                        )
                        continue
                    if len(payload) > MAX_MESSAGE_BYTES:
                        await websocket.send_json(
                            {"type": "error", "message": "Khung hình gửi lên quá lớn."}
                        )
                        continue

                    if message_type == "audio":
                        await session.send_realtime_input(
                            audio=types.Blob(
                                data=payload, mime_type="audio/pcm;rate=16000"
                            )
                        )
                    else:
                        await session.send_realtime_input(
                            video=types.Blob(data=payload, mime_type="image/jpeg")
                        )

            async def send_to_browser():
                while True:
                    async for response in session.receive():
                        server_content = response.server_content
                        if server_content is None:
                            continue
                        if server_content.interrupted:
                            await websocket.send_json({"type": "interrupted"})
                        if server_content.model_turn:
                            for part in server_content.model_turn.parts:
                                inline_data = part.inline_data
                                if inline_data and inline_data.mime_type.startswith("audio/pcm"):
                                    await websocket.send_json(
                                        {
                                            "type": "audio",
                                            "data": base64.b64encode(
                                                inline_data.data
                                            ).decode("ascii"),
                                        }
                                    )

            tasks = [
                asyncio.create_task(receive_from_browser()),
                asyncio.create_task(send_to_browser()),
            ]
            done, pending = await asyncio.wait(
                tasks, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            for task in done:
                task.result()
    except WebSocketDisconnect:
        logger.info("Tutor WebSocket disconnected")
    except Exception:
        logger.exception("Tutor WebSocket session failed")
        try:
            await websocket.send_json(
                {
                    "type": "error",
                    "message": "Không thể kết nối Teacher Emma. Vui lòng thử lại sau.",
                }
            )
            await websocket.close(code=1011)
        except WebSocketDisconnect:
            pass
    finally:
        await client.aio.aclose()
