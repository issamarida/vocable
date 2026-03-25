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
  const indexRef = useRef(-1);
  const activeRef = useRef(false);
  const genRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  sentencesRef.current = sentences;
  rateRef.current = rate;

  // Keep lang ref in sync (used by page, not by TTS call itself)
  const langRef = useRef(lang);
  langRef.current = lang;

  const cleanup = useCallback(() => {
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

  const speakAt = useCallback(
    (index: number) => {
      const gen = ++genRef.current;
      cleanup();

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

          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
          }
          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;

          if (!audioRef.current) {
            audioRef.current = new Audio();
          }

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
          if (gen === genRef.current) {
            console.error("TTS fetch error:", err);
            activeRef.current = false;
            setIsPlaying(false);
            setIsPaused(false);
          }
        });
    },
    [cleanup],
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
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPaused(true);
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
    setIsPaused(false);
    setIsPlaying(true);
  }, []);

  const stop = useCallback(() => {
    genRef.current++;
    activeRef.current = false;
    cleanup();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentIndex(-1);
    indexRef.current = -1;
  }, [cleanup]);

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

  // Apply playback rate changes instantly without re-fetching
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, [rate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      genRef.current++;
      activeRef.current = false;
      cleanup();
    };
  }, [cleanup]);

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
