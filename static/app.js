const avatarContainer = document.getElementById("avatar-container");
const avatarFallback = document.getElementById("avatar-fallback");
const statusBadge = document.getElementById("status-badge");
const startBtn = document.getElementById("start-btn");
const endBtn = document.getElementById("end-btn");
const camBtn = document.getElementById("cam-btn");
const webcamVideo = document.getElementById("kid-webcam");
const transcriptList = document.getElementById("transcript-list");
const transcriptEmpty = document.getElementById("transcript-empty");

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
let head = null;
let ws = null;
let mediaStream = null;
let inputContext = null;
let outputContext = null;
let nextPlayTime = 0;
let activeSources = [];
let videoInterval = null;
let cameraOn = true;
let disconnecting = false;
let socketError = null;
let listeningTimer = null;

function setStatus(message, error = false) {
    statusBadge.textContent = message;
    statusBadge.classList.toggle("text-rose-700", error);
    statusBadge.classList.toggle("text-amber-700", !error);
    statusBadge.classList.toggle("text-emerald-700", !error && message.startsWith("🟢"));
}

function addTranscript(speaker, text) {
    const trimmedText = text.trim();
    if (!trimmedText) return;
    if (transcriptEmpty && transcriptEmpty.isConnected) transcriptEmpty.remove();

    const row = document.createElement("p");
    row.className = "text-slate-700";
    const label = document.createElement("strong");
    label.className = speaker === "teacher" ? "text-indigo-700" : "text-emerald-700";
    label.textContent = speaker === "teacher" ? "Emma: " : "You: ";
    row.append(label, document.createTextNode(trimmedText));
    transcriptList.appendChild(row);

    while (transcriptList.children.length > 10) {
        transcriptList.firstElementChild.remove();
    }
    transcriptList.scrollTop = transcriptList.scrollHeight;
}

async function initAvatar() {
    try {
        const { TalkingHead } = await import("talkinghead");
        head = new TalkingHead(avatarContainer, {
            ttsEndpoint: "none",
            cameraView: "upper",
            cameraDistance: 0.4,
            lightAmbientIntensity: 2.2
        });
        await head.showAvatar({
            url: "https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb?morphTargets=ARKit,Oculus+Visemes",
            body: "F",
            avatarMood: "happy"
        });
        avatarFallback.classList.add("hidden");
        setStatus("Sẵn sàng vào lớp!");
    } catch (error) {
        console.error("Could not load the 3D avatar:", error);
        setStatus("Avatar 3D không tải được; vẫn có thể bắt đầu học.");
    } finally {
        startBtn.disabled = false;
    }
}

function downsampleTo16k(floatData, inputRate) {
    if (inputRate === INPUT_SAMPLE_RATE) return floatData;
    const ratio = inputRate / INPUT_SAMPLE_RATE;
    const outputLength = Math.floor(floatData.length / ratio);
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.min(Math.floor((i + 1) * ratio), floatData.length);
        let total = 0;
        for (let j = start; j < end; j++) total += floatData[j];
        output[i] = total / Math.max(1, end - start);
    }
    return output;
}

function sendAudio(event) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const samples = downsampleTo16k(
        event.inputBuffer.getChannelData(0),
        inputContext.sampleRate
    );
    const pcm = new Int16Array(samples.length);
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
        const sample = Math.max(-1, Math.min(1, samples[i]));
        pcm[i] = sample < 0 ? sample * 32768 : sample * 32767;
        sumSquares += sample * sample;
    }
    if (Math.sqrt(sumSquares / Math.max(1, samples.length)) > 0.018) {
        avatarFallback.classList.add("is-listening");
        clearTimeout(listeningTimer);
        listeningTimer = window.setTimeout(
            () => avatarFallback.classList.remove("is-listening"),
            700
        );
    }
    const bytes = new Uint8Array(pcm.buffer);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    ws.send(JSON.stringify({ type: "audio", data: btoa(binary) }));
}

async function setupMediaStreams() {
    mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        },
        video: { width: 320, height: 240 }
    });
    webcamVideo.srcObject = mediaStream;
    inputContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
    await inputContext.resume();

    const source = inputContext.createMediaStreamSource(mediaStream);
    const processor = inputContext.createScriptProcessor(4096, 1, 1);
    const silentOutput = inputContext.createGain();
    silentOutput.gain.value = 0;
    processor.onaudioprocess = sendAudio;
    source.connect(processor);
    processor.connect(silentOutput);
    silentOutput.connect(inputContext.destination);

    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const context = canvas.getContext("2d");
    videoInterval = window.setInterval(() => {
        if (!cameraOn || !ws || ws.readyState !== WebSocket.OPEN || webcamVideo.readyState < 2) return;
        context.drawImage(webcamVideo, 0, 0, canvas.width, canvas.height);
        const jpeg = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
        ws.send(JSON.stringify({ type: "video", data: jpeg }));
    }, 1500);
}

function playPcmAudio(base64Data) {
    if (!outputContext) outputContext = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
    if (outputContext.state === "suspended") outputContext.resume();

    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const evenLength = bytes.length - (bytes.length % 2);
    const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, evenLength / 2);
    const float32 = new Float32Array(int16.length);
    let sumSquares = 0;
    for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768;
        sumSquares += float32[i] * float32[i];
    }

    if (head && float32.length) {
        head.setFixedValue("jawOpen", Math.min(1, Math.sqrt(sumSquares / float32.length) * 6.5));
    }
    avatarFallback.classList.remove("is-listening");
    avatarFallback.classList.add("is-speaking");
    const buffer = outputContext.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
    buffer.getChannelData(0).set(float32);
    const source = outputContext.createBufferSource();
    source.buffer = buffer;
    source.connect(outputContext.destination);

    const startTime = Math.max(outputContext.currentTime, nextPlayTime);
    source.start(startTime);
    nextPlayTime = startTime + buffer.duration;
    activeSources.push(source);
    source.onended = () => {
        activeSources = activeSources.filter(item => item !== source);
        if (activeSources.length === 0) {
            if (head) head.setFixedValue("jawOpen", 0);
            avatarFallback.classList.remove("is-speaking");
        }
    };
}

function stopAllAudio() {
    for (const source of activeSources) {
        try {
            source.stop();
        } catch (error) {
            console.debug("Audio source already stopped:", error);
        }
    }
    activeSources = [];
    nextPlayTime = 0;
    if (head) head.setFixedValue("jawOpen", 0);
    avatarFallback.classList.remove("is-speaking", "is-listening");
    clearTimeout(listeningTimer);
}

function releaseMedia() {
    if (videoInterval !== null) {
        clearInterval(videoInterval);
        videoInterval = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    webcamVideo.srcObject = null;
    if (inputContext) {
        inputContext.close();
        inputContext = null;
    }
    camBtn.disabled = true;
}

function endCall() {
    if (disconnecting) return;
    disconnecting = true;
    stopAllAudio();
    releaseMedia();
    const socket = ws;
    ws = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    startBtn.disabled = false;
    endBtn.disabled = true;
    endBtn.classList.add("hidden");
    startBtn.classList.remove("hidden");
    setStatus("Cuộc gọi đã kết thúc.");
    disconnecting = false;
}

startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    setStatus("Đang xin quyền microphone và camera…");
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Hãy mở ứng dụng bằng HTTPS hoặc localhost để bật camera và microphone.");
        }
        await setupMediaStreams();
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(`${protocol}//${location.host}/ws`);
        socketError = null;
        ws = socket;
        socket.onopen = () => {
            setStatus("🟢 Đang học trực tiếp — hãy nói “Hello Teacher” nhé!");
            startBtn.classList.add("hidden");
            endBtn.classList.remove("hidden");
            endBtn.disabled = false;
            camBtn.disabled = false;
            if (head) head.playGesture("wave");
        };
        socket.onmessage = event => {
            const message = JSON.parse(event.data);
            if (message.type === "audio") playPcmAudio(message.data);
            else if (message.type === "interrupted") stopAllAudio();
            else if (message.type === "transcript") addTranscript(message.speaker, message.text);
            else if (message.type === "error") {
                socketError = message.message;
                setStatus(socketError, true);
            }
        };
        socket.onerror = () => {
            socketError = socketError || "Kết nối bị lỗi. Hãy thử gọi lại.";
            setStatus(socketError, true);
        };
        socket.onclose = () => {
            if (ws === socket && !disconnecting) {
                stopAllAudio();
                releaseMedia();
                ws = null;
                startBtn.disabled = false;
                endBtn.disabled = true;
                endBtn.classList.add("hidden");
                startBtn.classList.remove("hidden");
                setStatus(socketError || "Cuộc gọi đã kết thúc.", Boolean(socketError));
            }
        };
    } catch (error) {
        console.error("Could not start the tutor call:", error);
        releaseMedia();
        setStatus(error.message || "Không thể bật microphone/camera.", true);
        startBtn.disabled = false;
    }
});

endBtn.addEventListener("click", endCall);

camBtn.addEventListener("click", () => {
    cameraOn = !cameraOn;
    const videoTrack = mediaStream && mediaStream.getVideoTracks()[0];
    if (videoTrack) videoTrack.enabled = cameraOn;
    webcamVideo.style.opacity = cameraOn ? "1" : "0.25";
    camBtn.textContent = cameraOn ? "📷 Tắt camera" : "📷 Bật camera";
});

window.addEventListener("beforeunload", () => {
    if (ws) ws.close();
    releaseMedia();
});

initAvatar();
