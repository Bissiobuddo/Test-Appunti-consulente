import { useEffect, useState } from "react";
import { Gauge, Pause, Play, SkipBack, SkipForward, TriangleAlert, X } from "lucide-react";
import { categoryLabel } from "../../shared/sources.ts";
import type { ReadingItem } from "../lib/reading.ts";
import { SPEECH_ERROR, speak, stopSpeaking } from "../lib/speech.ts";
import { keepAwake, releaseAwake } from "../lib/wakeLock.ts";

const RATES = [0.9, 1, 1.15, 1.3];

interface Props {
  items: ReadingItem[];
  rate: number;
  onRateChange: (rate: number) => void;
  onClose: () => void;
}

/** Modalità auto: legge le notizie una dopo l'altra, con pulsanti grandi da toccare senza guardare. */
export function CarMode({ items, rate, onRateChange, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [failed, setFailed] = useState(false);
  const item = items[index];

  useEffect(() => {
    void keepAwake();
    return () => {
      void stopSpeaking();
      void releaseAwake();
    };
  }, []);

  useEffect(() => {
    if (!playing || !item) return;
    let cancelled = false;
    setFailed(false);
    void speak(item.text, rate).then((result) => {
      if (result === "stopped" || cancelled) return;
      if (result === "failed") {
        setFailed(true);
        setPlaying(false);
      } else if (index + 1 < items.length) setIndex(index + 1);
      else setPlaying(false);
    });
    return () => {
      cancelled = true;
      void stopSpeaking();
    };
    // La lettura riparte solo cambiando notizia, pausa o velocità, non a ogni nuovo rendering.
  }, [index, playing, rate, item?.key]);

  const go = (delta: number) => setIndex((i) => Math.min(Math.max(i + delta, 0), items.length - 1));

  return (
    <div className="car">
      <header className="car-top">
        <button className="car-close" onClick={onClose} aria-label="Esci dalla modalità auto">
          <X size={28} />
        </button>
        <span className="car-count">
          {items.length ? index + 1 : 0} / {items.length}
        </span>
        <button
          className="car-rate"
          onClick={() => onRateChange(RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1)}
          aria-label="Velocità di lettura"
        >
          <Gauge size={22} /> {rate.toLocaleString("it-IT")}×
        </button>
      </header>

      <main className="car-main" aria-live="polite">
        {item ? (
          <>
            <span className="car-cat">{categoryLabel(item.category)}</span>
            <h1>{item.title}</h1>
            {!playing && !failed && <p className="car-paused">In pausa</p>}
            {failed && (
              <p className="car-paused">
                <TriangleAlert size={20} /> {SPEECH_ERROR}
              </p>
            )}
          </>
        ) : (
          <h1>Nessuna notizia da leggere</h1>
        )}
        <div className="car-progress">
          <span style={{ width: `${items.length ? ((index + 1) / items.length) * 100 : 0}%` }} />
        </div>
      </main>

      <nav className="car-controls">
        <button onClick={() => go(-1)} disabled={index === 0} aria-label="Notizia precedente">
          <SkipBack size={40} />
        </button>
        <button className="car-play" onClick={() => setPlaying(!playing)} disabled={!item} aria-label={playing ? "Pausa" : "Riprendi"}>
          {playing ? <Pause size={56} /> : <Play size={56} />}
        </button>
        <button onClick={() => go(1)} disabled={index >= items.length - 1} aria-label="Notizia successiva">
          <SkipForward size={40} />
        </button>
      </nav>
    </div>
  );
}
