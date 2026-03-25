"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface UseSpeechReturn {
  isPlaying: boolean;
  isPaused: boolean;
  currentIndex: number;
  play: (fromIndex?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  skipForward: () => void;
  skipBack: () => void;
}

type Engine = "elevenlabs" | "browser";

const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

export function useSpeech({
  sentences,
  lang,
  rate,
}: {
  sentences: string[];
  lang: string;
  rate: number;
}): UseSpeechReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const sentencesRef = useRef(sentences);
  const rateRef = useRef(rate);
  const langRef = useRef(lang);
  const indexRef = useRef(-1);
  const activeRef = useRef(false);
  const genRef = useRef(0);
  const engineRef = useRef<Engine>("elevenlabs");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  sentencesRef.current = sentences;
  rateRef.current = rate;
  langRef.current = lang;

  // Pre-load browser voices
  useEffect(() => {
    synth?.getVoices();
    const h = () => synth?.getVoices();
    synth?.addEventListener("voiceschanged", h);
    return () => synth?.removeEventListener("voiceschanged", h);
  }, []);

  const cleanupAudio = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const cleanupBrowser = useCallback(() => {
    synth?.cancel();
  }, []);

  const cleanupAll = useCallback(() => {
    cleanupAudio();
    cleanupBrowser();
  }, [cleanupAudio, cleanupBrowser]);

  /* ── Browser SpeechSynthesis fallback ──────────────── */
  const speakBrowserAt = useCallback(
    (index: number) => {
      if (!synth) return;
      const gen = ++genRef.current;
      synth.cancel();

      if (index < 0 || index >= sentencesRef.current.length) {
        activeRef.current = false;
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentIndex(-1);
        indexRef.current = -1;
        return;
      }

      indexRef.current = index;
      setCurrentIndex(index);

      setTimeout(() => {
        if (gen !== genRef.current) return;

        const text = sentencesRef.current[index];
        if (!text) return;

        const utt = new SpeechSynthesisUtterance(text);
        const voices = synth.getVoices();
        const lc = langRef.current;
        const prefix = lc.split("-")[0];
        const voice =
          voices.find((v) => v.lang === lc) ??
          voices.find((v) => v.lang.startsWith(prefix)) ??
          voices.find((v) => v.default);
        if (voice) utt.voice = voice;
        utt.lang = lc;
        utt.rate = rateRef.current;

        utt.onend = () => {
          if (gen === genRef.current && activeRef.current) {
            speakBrowserAt(indexRef.current + 1);
          }
        };
        utt.onerror = (e) => {
          if (e.error !== "canceled" && e.error !== "interrupted") {
            activeRef.current = false;
            setIsPlaying(false);
            setIsPaused(false);
          }
        };

        synth.speak(utt);
      }, 50);
    },
    [],
  );

  /* ── ElevenLabs primary engine ─────────────────────── */
  const speakElevenLabsAt = useCallback(
    (index: number) => {
      const gen = ++genRef.current;
      cleanupAudio();

      if (index < 0 || index >= sentencesRef.current.length) {
        activeRef.current = false;
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentIndex(-1);
        indexRef.current = -1;
        return;
      }

      indexRef.current = index;
      setCurrentIndex(index);

      const text = sentencesRef.current[index];
      if (!text) return;

      const controller = new AbortController();
      abortRef.current = controller;

      fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      })
        .then((res) => {
          if (gen !== genRef.current) return null;
          if (!res.ok) throw new Error(`TTS failed (${res.status})`);
          return res.blob();
        })
        .then((blob) => {
          if (!blob || gen !== genRef.current) return;

          if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;

          if (!audioRef.current) audioRef.current = new Audio();
          const audio = audioRef.current;
          audio.src = url;
          audio.playbackRate = rateRef.current;

          audio.onended = () => {
            if (gen === genRef.current && activeRef.current) {
              speakAt(indexRef.current + 1);
            }
          };
          audio.onerror = () => {
            if (gen === genRef.current) {
              activeRef.current = false;
              setIsPlaying(false);
              setIsPaused(false);
            }
          };

          audio.play().catch(() => {
            if (gen === genRef.current) {
              activeRef.current = false;
              setIsPlaying(false);
              setIsPaused(false);
            }
          });
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          if (gen !== genRef.current) return;

          // ElevenLabs failed — switch to browser fallback
          console.warn("ElevenLabs unavailable, falling back to browser speech");
          engineRef.current = "browser";
          speakBrowserAt(index);
        });
    },
    [cleanupAudio, speakBrowserAt],
  );

  /* ── Unified dispatch ──────────────────────────────── */
  const speakAt = useCallback(
    (index: number) => {
      if (engineRef.current === "browser") {
        speakBrowserAt(index);
      } else {
        speakElevenLabsAt(index);
      }
    },
    [speakBrowserAt, speakElevenLabsAt],
  );

  const play = useCallback(
    (fromIndex = 0) => {
      activeRef.current = true;
      setIsPlaying(true);
      setIsPaused(false);
      speakAt(fromIndex);
    },
    [speakAt],
  );

  const pause = useCallback(() => {
    if (engineRef.current === "browser") {
      synth?.pause();
    } else if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPaused(true);
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    if (engineRef.current === "browser") {
      synth?.resume();
    } else if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
    setIsPaused(false);
    setIsPlaying(true);
  }, []);

  const stop = useCallback(() => {
    genRef.current++;
    activeRef.current = false;
    cleanupAll();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentIndex(-1);
    indexRef.current = -1;
  }, [cleanupAll]);

  const skipForward = useCallback(() => {
    const next = Math.min(
      indexRef.current + 1,
      sentencesRef.current.length - 1,
    );
    if (activeRef.current) {
      speakAt(next);
    } else {
      indexRef.current = next;
      setCurrentIndex(next);
    }
  }, [speakAt]);

  const skipBack = useCallback(() => {
    const prev = Math.max(indexRef.current - 1, 0);
    if (activeRef.current) {
      speakAt(prev);
    } else {
      indexRef.current = prev;
      setCurrentIndex(prev);
    }
  }, [speakAt]);

  // Apply playback rate — works for both engines
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
    if (
      engineRef.current === "browser" &&
      activeRef.current &&
      indexRef.current >= 0
    ) {
      speakBrowserAt(indexRef.current);
    }
  }, [rate, speakBrowserAt]);

  // Chrome keep-alive for browser engine
  useEffect(() => {
    if (!synth || !isPlaying || engineRef.current !== "browser") return;
    const id = setInterval(() => {
      if (synth.speaking && !synth.paused) {
        synth.pause();
        synth.resume();
      }
    }, 10_000);
    return () => clearInterval(id);
  }, [isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      genRef.current++;
      activeRef.current = false;
      cleanupAll();
    };
  }, [cleanupAll]);

  return {
    isPlaying,
    isPaused,
    currentIndex,
    play,
    pause,
    resume,
    stop,
    skipForward,
    skipBack,
  };
}
