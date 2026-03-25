"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
} from "react";
import { splitSentences } from "@/lib/split-sentences";
import { useSpeech } from "@/lib/use-speech";

interface ExtractedContent {
  title: string;
  content: string;
  excerpt: string;
}

const LANGUAGES = [
  { code: "en-US", label: "English" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "pt-BR", label: "Portuguese" },
  { code: "it-IT", label: "Italian" },
  { code: "nl-NL", label: "Dutch" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "zh-CN", label: "Chinese" },
  { code: "ar-SA", label: "Arabic" },
  { code: "hi-IN", label: "Hindi" },
  { code: "ru-RU", label: "Russian" },
];

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [article, setArticle] = useState<ExtractedContent | null>(null);
  const [originalSentences, setOriginalSentences] = useState<string[]>([]);

  const [mode, setMode] = useState<"listen" | "understand">("listen");
  const [understoodText, setUnderstoodText] = useState<string | null>(null);
  const [understoodSentences, setUnderstoodSentences] = useState<string[]>([]);
  const [understandLoading, setUnderstandLoading] = useState(false);

  const [lang, setLang] = useState("en-US");
  const [rate, setRate] = useState(1);

  // Translation cache: langCode -> sentences
  const [translationCache, setTranslationCache] = useState<
    Record<string, string[]>
  >({});
  const [translateLoading, setTranslateLoading] = useState(false);

  const isEnglish = lang === "en-US";

  const listenSentences =
    !isEnglish && translationCache[lang]
      ? translationCache[lang]
      : originalSentences;

  const activeSentences =
    mode === "understand" && understoodSentences.length > 0
      ? understoodSentences
      : listenSentences;

  const speech = useSpeech({ sentences: activeSentences, lang, rate });

  const sentenceRefs = useRef<Map<number, HTMLSpanElement>>(new Map());
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentenceRefs.current.get(speech.currentIndex);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [speech.currentIndex]);

  const handleLangChange = useCallback(
    async (newLang: string) => {
      speech.stop();
      setLang(newLang);
      setError("");

      // Reset understand cache so it regenerates in the new language
      setUnderstoodText(null);
      setUnderstoodSentences([]);

      // If switching to English, no translation needed
      if (newLang === "en-US" || !article) return;

      // If we already have a cached translation, use it
      if (translationCache[newLang]) return;

      // Translate the original text for Listen mode
      const langLabel =
        LANGUAGES.find((l) => l.code === newLang)?.label ?? "English";
      setTranslateLoading(true);
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: article.content, language: langLabel }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Translation failed");
          return;
        }
        setTranslationCache((prev) => ({
          ...prev,
          [newLang]: splitSentences(data.content),
        }));
      } catch {
        setError("Network error during translation");
      } finally {
        setTranslateLoading(false);
      }
    },
    [speech, article, translationCache],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    speech.stop();
    setError("");
    setArticle(null);
    setOriginalSentences([]);
    setUnderstoodText(null);
    setUnderstoodSentences([]);
    setTranslationCache({});
    setMode("listen");

    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please enter a URL");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to extract content");
        return;
      }
      setArticle(data);
      setOriginalSentences(splitSentences(data.content));
    } catch {
      setError("Network error — please check the URL and try again");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnderstand() {
    if (!article) return;

    if (understoodText) {
      speech.stop();
      setMode("understand");
      return;
    }

    speech.stop();
    setUnderstandLoading(true);
    setError("");
    try {
      const langLabel =
        LANGUAGES.find((l) => l.code === lang)?.label ?? "English";
      const res = await fetch("/api/understand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: article.content, language: langLabel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to generate explanation");
        return;
      }
      setUnderstoodText(data.content);
      setUnderstoodSentences(splitSentences(data.content));
      setMode("understand");
    } catch {
      setError("Network error while generating explanation");
    } finally {
      setUnderstandLoading(false);
    }
  }

  function handleListen() {
    speech.stop();
    setMode("listen");
  }

  function togglePlayPause() {
    if (speech.isPlaying) {
      speech.pause();
    } else if (speech.isPaused) {
      speech.resume();
    } else {
      speech.play(Math.max(0, speech.currentIndex));
    }
  }

  const progress =
    activeSentences.length > 0 && speech.currentIndex >= 0
      ? ((speech.currentIndex + 1) / activeSentences.length) * 100
      : 0;

  const hasContent = article && activeSentences.length > 0;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Accent gradient top bar */}
      <div className="h-1 shrink-0 bg-gradient-to-r from-violet-600 via-purple-500 to-fuchsia-500" />

      {/* Header */}
      <header className="w-full border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              Vocable
            </h1>
            <p className="text-xs text-muted mt-0.5">
              Turn any webpage into audio you can follow and understand
            </p>
          </div>
          {article && (
            <select
              value={lang}
              onChange={(e) => handleLangChange(e.target.value)}
              className="h-8 px-3 rounded-md bg-surface border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-light cursor-pointer"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {/* Main */}
      <main
        className="flex-1 flex flex-col"
        style={{ paddingBottom: hasContent ? 160 : 0 }}
      >
        {/* URL Input */}
        <div className="w-full max-w-3xl mx-auto px-6 pt-8 pb-4">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a webpage URL..."
              className="flex-1 h-12 px-4 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent-light/50 focus:border-accent-light/30 transition-all"
            />
            <button
              type="submit"
              disabled={loading}
              className="h-12 px-6 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-600/20 hover:shadow-violet-500/30"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Spinner /> Loading
                </span>
              ) : (
                "Load"
              )}
            </button>
          </form>
        </div>

        {/* Error */}
        {error && (
          <div className="w-full max-w-3xl mx-auto px-6">
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          </div>
        )}

        {/* Content Area */}
        {article && (
          <div className="w-full max-w-3xl mx-auto px-6 pt-4 flex flex-col gap-5 flex-1">
            {/* Title */}
            <div>
              <h2 className="text-lg font-semibold leading-snug">
                {article.title}
              </h2>
              {article.excerpt && (
                <p className="text-sm text-muted mt-1.5 leading-relaxed line-clamp-2">
                  {article.excerpt}
                </p>
              )}
            </div>

            {/* Mode toggle */}
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  onClick={handleListen}
                  className={`px-4 py-2 text-sm font-medium transition-all ${
                    mode === "listen"
                      ? "bg-accent text-white"
                      : "bg-surface text-muted hover:text-foreground hover:bg-surface-hover"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <IconHeadphones className="w-3.5 h-3.5" />
                    Listen
                  </span>
                </button>
                <button
                  onClick={handleUnderstand}
                  disabled={understandLoading}
                  className={`px-4 py-2 text-sm font-medium transition-all border-l border-border disabled:opacity-50 ${
                    mode === "understand"
                      ? "bg-accent text-white"
                      : "bg-surface text-muted hover:text-foreground hover:bg-surface-hover"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {understandLoading ? (
                      <Spinner />
                    ) : (
                      <IconBrain className="w-3.5 h-3.5" />
                    )}
                    Understand
                  </span>
                </button>
              </div>
              {mode === "understand" && understoodText && (
                <span className="text-xs text-accent-light px-2 py-0.5 rounded-full bg-accent-light/10 border border-accent-light/20">
                  Simplified
                </span>
              )}
              {mode === "listen" && !isEnglish && translationCache[lang] && (
                <span className="text-xs text-accent-light px-2 py-0.5 rounded-full bg-accent-light/10 border border-accent-light/20">
                  Translated
                </span>
              )}
              {translateLoading && (
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <Spinner /> Translating...
                </span>
              )}
            </div>

            {/* Reading pane */}
            <div
              ref={contentRef}
              className="rounded-xl border border-border bg-surface/60 p-6 max-h-[55vh] overflow-y-auto leading-[1.9] text-[15px] scroll-smooth scrollbar-thin"
            >
              {activeSentences.map((sentence, i) => (
                <span
                  key={`${mode}-${lang}-${i}`}
                  ref={(el) => {
                    if (el) sentenceRefs.current.set(i, el);
                    else sentenceRefs.current.delete(i);
                  }}
                  className={`inline transition-all duration-200 rounded-sm px-0.5 -mx-0.5 ${
                    speech.currentIndex === i
                      ? "bg-accent-light/20 text-white ring-1 ring-accent-light/30"
                      : speech.currentIndex >= 0 && i < speech.currentIndex
                        ? "text-muted/70"
                        : "text-foreground/90"
                  }`}
                >
                  {sentence}{" "}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!article && !loading && !error && (
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 border border-violet-500/10 flex items-center justify-center">
                <IconHeadphones className="w-7 h-7 text-violet-400" />
              </div>
              <p className="text-lg text-muted font-medium">
                Paste a URL above to get started
              </p>
              <p className="text-sm text-muted/60 mt-1.5 max-w-xs mx-auto">
                Works best with articles, blog posts, and documentation pages
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Playback bar — fixed bottom */}
      {hasContent && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-surface/95 backdrop-blur-lg">
          {/* Progress bar */}
          <div className="h-0.5 bg-border">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="max-w-3xl mx-auto px-6 py-3">
            <div className="flex items-center justify-between gap-4">
              {/* Playback controls */}
              <div className="flex items-center gap-1">
                <button
                  onClick={speech.skipBack}
                  disabled={speech.currentIndex <= 0 && !speech.isPlaying}
                  className="w-9 h-9 flex items-center justify-center rounded-full text-muted hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-30"
                >
                  <IconSkipBack className="w-4 h-4" />
                </button>

                <button
                  onClick={togglePlayPause}
                  className="w-11 h-11 flex items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-600/25 transition-all"
                >
                  {speech.isPlaying ? (
                    <IconPause className="w-4.5 h-4.5" />
                  ) : (
                    <IconPlay className="w-4.5 h-4.5 ml-0.5" />
                  )}
                </button>

                <button
                  onClick={speech.skipForward}
                  disabled={
                    speech.currentIndex >= activeSentences.length - 1 &&
                    !speech.isPlaying
                  }
                  className="w-9 h-9 flex items-center justify-center rounded-full text-muted hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-30"
                >
                  <IconSkipForward className="w-4 h-4" />
                </button>
              </div>

              {/* Sentence counter */}
              <div className="text-xs text-muted font-mono tabular-nums hidden sm:block">
                {speech.currentIndex >= 0 ? speech.currentIndex + 1 : 0}
                {" / "}
                {activeSentences.length}
              </div>

              {/* Speed control */}
              <div className="flex items-center gap-0.5 rounded-lg border border-border overflow-hidden">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setRate(s)}
                    className={`px-2.5 py-1.5 text-xs font-medium transition-all ${
                      rate === s
                        ? "bg-accent text-white"
                        : "bg-transparent text-muted hover:text-foreground hover:bg-white/5"
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Icons ─────────────────────────────────────────────── */

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <circle cx="12" cy="12" r="10" className="opacity-25" />
      <path
        d="M4 12a8 8 0 018-8"
        className="opacity-75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPlay({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <path d="M8 5.14v14.72a1 1 0 001.5.86l11-7.36a1 1 0 000-1.72l-11-7.36A1 1 0 008 5.14z" />
    </svg>
  );
}

function IconPause({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function IconSkipBack({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <path d="M19 20a1 1 0 01-1.5.86L8 14.18V20a1 1 0 01-2 0V4a1 1 0 012 0v5.82l9.5-6.68A1 1 0 0119 4v16z" />
    </svg>
  );
}

function IconSkipForward({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <path d="M5 4a1 1 0 011.5-.86L16 9.82V4a1 1 0 012 0v16a1 1 0 01-2 0v-5.82l-9.5 6.68A1 1 0 015 20V4z" />
    </svg>
  );
}

function IconHeadphones({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 18v-6a9 9 0 0118 0v6" />
      <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z" />
    </svg>
  );
}

function IconBrain({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z" />
      <path d="M9 21h6M10 17v4M14 17v4" />
    </svg>
  );
}
