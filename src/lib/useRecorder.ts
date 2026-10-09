import { useCallback, useEffect, useRef, useState } from "react";
import { keepAwake, releaseAwake } from "./wakeLock.ts";

const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function extensionFor(mime: string) {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

/** Registrazione audio con MediaRecorder; permette di scegliere il microfono (es. Bluetooth). */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | undefined>(undefined);

  const cleanup = useCallback(() => {
    window.clearInterval(timerRef.current);
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    setRecording(false);
    setPaused(false);
    void releaseAwake();
  }, []);

  const start = useCallback(async (deviceId?: string) => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.start(1000);
      recorderRef.current = rec;
      setSeconds(0);
      timerRef.current = window.setInterval(() => {
        if (recorderRef.current?.state === "recording") setSeconds((s) => s + 1);
      }, 1000);
      setRecording(true);
      void keepAwake();
    } catch (err) {
      setError(err instanceof Error ? `Microfono non disponibile: ${err.message}` : "Microfono non disponibile");
    }
  }, []);

  const togglePause = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      setPaused(true);
    } else if (rec.state === "paused") {
      rec.resume();
      setPaused(false);
    }
  }, []);

  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const rec = recorderRef.current;
        if (!rec) return resolve(null);
        rec.onstop = () => {
          resolve(new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }));
          cleanup();
        };
        rec.stop();
      }),
    [cleanup],
  );

  useEffect(() => cleanup, [cleanup]);

  return { recording, paused, seconds, error, start, stop, togglePause };
}

export async function listMicrophones(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "audioinput" && d.deviceId);
}
