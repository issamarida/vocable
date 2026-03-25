"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
} from "react";
import { splitIntoParagraphs } from "@/lib/split-sentences";
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
  const [originalParagraphs, setOriginalParagraphs] = useState<string[][]>([]);

  const [mode, setMode] = useState<"listen" | "understand">("listen");
  const [understoodText, setUnderstoodText] = useState<string | null>(null);
  const [understoodParagraphs, setUnderstoodParagraphs] = useState<string[][]>([]);
  const [understandLoading, setUnderstandLoading] = useState(false);

  const [lang, setLang] = useState("en-US");
  const [rate, setRate] = useState(1);

  const [translationCache, setTranslationCache] = useState<
    Record<string, string[][]>
  >({});
  const [translateLoading, setTranslateLoading] = useState(false);

  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const isEnglish = lang === "en-US";

  const listenParagraphs =
    !isEnglish && translationCache[lang]
      ? translationCache[lang]
      : originalParagraphs;

  const activeParagraphs =
    mode === "understand" && understoodParagraphs.length > 0
      ? understoodParagraphs
      : listenParagraphs;

  const activeSentences = activeParagraphs.flat();

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
      setUnderstoodText(null);
      setUnderstoodParagraphs([]);

      if (newLang === "en-US" || !article) return;
      if (translationCache[newLang]) return;

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
          [newLang]: splitIntoParagraphs(data.content),
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
    setOriginalParagraphs([]);
    setUnderstoodText(null);
    setUnderstoodParagraphs([]);
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
      setOriginalParagraphs(splitIntoParagraphs(data.content));
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
      setUnderstoodParagraphs(splitIntoParagraphs(data.content));
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

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="w-full border-b border-border bg-surface sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
              Vocable
            </h1>
            <p className="text-[13px] text-muted mt-0.5">
              Turn any webpage into audio you can follow and understand
            </p>
          </div>
          <div className="flex items-center gap-2">
            {article && (
              <select
                value={lang}
                onChange={(e) => handleLangChange(e.target.value)}
                className="h-9 px-3 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent cursor-pointer transition"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-background text-muted hover:text-foreground hover:bg-accent-soft transition-all"
            >
              {mounted ? (
                dark ? <IconSun className="w-[18px] h-[18px]" /> : <IconMoon className="w-[18px] h-[18px]" />
              ) : (
                <span className="w-[18px] h-[18px]" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main
        className="flex-1 flex flex-col"
        style={{ paddingBottom: hasContent ? 140 : 0 }}
      >
        {/* URL Input */}
        <div className="w-full max-w-2xl mx-auto px-6 pt-10 pb-6">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a webpage URL..."
              className="flex-1 h-[52px] px-5 text-[15px] rounded-2xl bg-surface border border-border text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
              style={{ boxShadow: "var(--shadow)" }}
            />
            <button
              type="submit"
              disabled={loading}
              className="h-[52px] px-7 rounded-2xl bg-accent hover:bg-accent-hover text-white text-[15px] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ boxShadow: "var(--shadow-md)" }}
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
          <div className="w-full max-w-2xl mx-auto px-6 pb-4">
            <div className="px-4 py-3 rounded-xl border text-sm bg-red-50 border-red-200 text-red-600 dark:bg-red-950/40 dark:border-red-900/50 dark:text-red-400">
              {error}
            </div>
          </div>
        )}

        {/* Content Area */}
        {article && (
          <div className="w-full max-w-2xl mx-auto px-6 flex flex-col gap-6 flex-1">
            {/* Title */}
            <div>
              <h2 className="text-xl font-semibold leading-snug text-foreground">
                {article.title}
              </h2>
              {article.excerpt && (
                <p className="text-sm text-muted mt-2 leading-relaxed line-clamp-2">
                  {article.excerpt}
                </p>
              )}
            </div>

            {/* Controls row */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {/* Mode toggle */}
                <div
                  className="flex rounded-xl overflow-hidden border border-border"
                  style={{ boxShadow: "var(--shadow)" }}
                >
                  <button
                    onClick={handleListen}
                    className={`px-5 py-2.5 text-sm font-medium transition-all ${
                      mode === "listen"
                        ? "bg-accent text-white"
                        : "bg-surface text-muted hover:text-foreground hover:bg-background"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <IconHeadphones className="w-4 h-4" />
                      Listen
                    </span>
                  </button>
                  <button
                    onClick={handleUnderstand}
                    disabled={understandLoading}
                    className={`px-5 py-2.5 text-sm font-medium transition-all border-l border-border disabled:opacity-50 ${
                      mode === "understand"
                        ? "bg-accent text-white"
                        : "bg-surface text-muted hover:text-foreground hover:bg-background"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {understandLoading ? (
                        <Spinner />
                      ) : (
                        <IconBrain className="w-4 h-4" />
                      )}
                      Understand
                    </span>
                  </button>
                </div>

                {/* Status badges */}
                {mode === "understand" && understoodText && (
                  <span className="text-xs text-accent font-medium px-2.5 py-1 rounded-full bg-accent-soft">
                    Simplified
                  </span>
                )}
                {mode === "listen" && !isEnglish && translationCache[lang] && (
                  <span className="text-xs text-accent font-medium px-2.5 py-1 rounded-full bg-accent-soft">
                    Translated
                  </span>
                )}
                {translateLoading && (
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <Spinner /> Translating...
                  </span>
                )}
              </div>
            </div>

            {/* Reading pane */}
            <div
              ref={contentRef}
              className="rounded-2xl border border-border bg-surface p-8 max-h-[55vh] overflow-y-auto leading-[2] text-[16px] scroll-smooth scrollbar-thin"
              style={{ boxShadow: "var(--shadow)" }}
            >
              {(() => {
                let flatIdx = 0;
                return activeParagraphs.map((para, pi) => (
                  <div
                    key={`${mode}-${lang}-para-${pi}`}
                    className={pi > 0 ? "mt-5" : ""}
                  >
                    {para.map((sentence, si) => {
                      const idx = flatIdx++;
                      return (
                        <span
                          key={`${mode}-${lang}-${idx}`}
                          ref={(el) => {
                            if (el) sentenceRefs.current.set(idx, el);
                            else sentenceRefs.current.delete(idx);
                          }}
                          className={`inline transition-all duration-200 rounded-md px-1 -mx-0.5 ${
                            speech.currentIndex === idx
                              ? "bg-highlight text-accent font-medium ring-1 ring-highlight-ring"
                              : speech.currentIndex >= 0 && idx < speech.currentIndex
                                ? "text-muted"
                                : "text-foreground"
                          }`}
                        >
                          {sentence}{si < para.length - 1 ? " " : ""}
                        </span>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* Landing page — shown when no content is loaded */}
        {!article && !loading && !error && (
          <>
            {/* Hero */}
            <div className="w-full max-w-3xl mx-auto px-6 pt-10 pb-16 text-center">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent-soft text-accent text-xs font-semibold tracking-wide mb-6">
                <IconHeadphones className="w-3.5 h-3.5" />
                AI-POWERED READING ASSISTANT
              </div>
              <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground leading-[1.15]">
                Read less.<br />Understand more.
              </h2>
              <p className="mt-5 text-lg text-muted max-w-xl mx-auto leading-relaxed">
                Vocable turns any webpage into audio you can follow and understand — in 13 languages, powered by AI.
              </p>
            </div>

            {/* Value props */}
            <div className="w-full max-w-3xl mx-auto px-6 pb-16">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-border bg-surface p-6 text-center" style={{ boxShadow: "var(--shadow)" }}>
                  <div className="w-11 h-11 mx-auto mb-3.5 rounded-xl bg-accent-soft flex items-center justify-center">
                    <IconHeadphones className="w-5 h-5 text-accent" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Listen Mode</h3>
                  <p className="mt-1.5 text-xs text-muted leading-relaxed">Hear any webpage read aloud with premium AI voices</p>
                </div>
                <div className="rounded-2xl border border-border bg-surface p-6 text-center" style={{ boxShadow: "var(--shadow)" }}>
                  <div className="w-11 h-11 mx-auto mb-3.5 rounded-xl bg-accent-soft flex items-center justify-center">
                    <IconBrain className="w-5 h-5 text-accent" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Understand Mode</h3>
                  <p className="mt-1.5 text-xs text-muted leading-relaxed">Get AI-simplified explanations of complex content</p>
                </div>
                <div className="rounded-2xl border border-border bg-surface p-6 text-center" style={{ boxShadow: "var(--shadow)" }}>
                  <div className="w-11 h-11 mx-auto mb-3.5 rounded-xl bg-accent-soft flex items-center justify-center">
                    <IconGlobe className="w-5 h-5 text-accent" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">13 Languages</h3>
                  <p className="mt-1.5 text-xs text-muted leading-relaxed">Listen and understand in your preferred language</p>
                </div>
              </div>
            </div>

            {/* How it works */}
            <div className="w-full max-w-3xl mx-auto px-6 pb-16">
              <h3 className="text-center text-xs font-semibold tracking-widest text-muted uppercase mb-8">How it works</h3>
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-0">
                <div className="flex-1 text-center px-4">
                  <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-accent text-white flex items-center justify-center text-sm font-bold">1</div>
                  <p className="text-sm font-medium text-foreground">Paste any URL</p>
                  <p className="text-xs text-muted mt-1">Articles, blogs, docs — anything</p>
                </div>
                <div className="hidden sm:block w-12 h-px bg-border" />
                <div className="flex-1 text-center px-4">
                  <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-accent text-white flex items-center justify-center text-sm font-bold">2</div>
                  <p className="text-sm font-medium text-foreground">Choose your mode</p>
                  <p className="text-xs text-muted mt-1">Listen word-for-word or get a simplified explanation</p>
                </div>
                <div className="hidden sm:block w-12 h-px bg-border" />
                <div className="flex-1 text-center px-4">
                  <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-accent text-white flex items-center justify-center text-sm font-bold">3</div>
                  <p className="text-sm font-medium text-foreground">Press play</p>
                  <p className="text-xs text-muted mt-1">Follow along as text highlights in real time</p>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Chrome Extension promo — bottom section */}
      <section className="w-full border-t border-border bg-surface">
        <div className="max-w-2xl mx-auto px-6 py-16">
          <div className="flex flex-col items-center gap-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent-soft text-accent text-xs font-semibold tracking-wide">
              ALSO AVAILABLE AS
            </div>
            <h3 className="text-2xl font-bold text-foreground text-center">
              Chrome Extension
            </h3>
            <p className="text-sm text-muted text-center max-w-md">
              Use Vocable directly on any page without leaving your browser.
            </p>
            <a
              href="https://github.com/gamsoulasieu2024-gif/ListenMode"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3.5 rounded-xl bg-[#111] hover:bg-[#222] dark:bg-white dark:hover:bg-gray-100 dark:text-[#111] text-white text-sm font-semibold tracking-wide transition-all"
              style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}
            >
              VIEW ON GITHUB
            </a>
            <div
              className="w-full rounded-xl overflow-hidden border border-border"
              style={{ boxShadow: "var(--shadow-lg)", aspectRatio: "16/9" }}
            >
              <iframe
                src="https://www.youtube.com/embed/BDM17EFHzZw"
                title="Vocable Chrome Extension Demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-border py-8 px-6">
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted">
          <span>&copy; {new Date().getFullYear()} Vocable. Built for accessibility.</span>
          <a
            href="https://github.com/issamarida/vocable"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition"
          >
            GitHub
          </a>
        </div>
      </footer>

      {/* Playback bar */}
      {hasContent && (
        <div
          className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-surface"
          style={{ boxShadow: "0 -4px 20px rgba(0,0,0,0.05)" }}
        >
          {/* Progress */}
          <div className="h-1 bg-border/50">
            <div
              className="h-full bg-accent transition-all duration-300 ease-out rounded-r-full"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="max-w-2xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between gap-6">
              {/* Transport controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={speech.skipBack}
                  disabled={speech.currentIndex <= 0 && !speech.isPlaying}
                  className="w-10 h-10 flex items-center justify-center rounded-xl text-muted hover:text-foreground hover:bg-background transition-all disabled:opacity-25"
                >
                  <IconSkipBack className="w-[18px] h-[18px]" />
                </button>

                <button
                  onClick={togglePlayPause}
                  className="w-12 h-12 flex items-center justify-center rounded-2xl bg-accent hover:bg-accent-hover text-white transition-all"
                  style={{ boxShadow: "var(--shadow-md)" }}
                >
                  {speech.isPlaying ? (
                    <IconPause className="w-5 h-5" />
                  ) : (
                    <IconPlay className="w-5 h-5 ml-0.5" />
                  )}
                </button>

                <button
                  onClick={speech.skipForward}
                  disabled={
                    speech.currentIndex >= activeSentences.length - 1 &&
                    !speech.isPlaying
                  }
                  className="w-10 h-10 flex items-center justify-center rounded-xl text-muted hover:text-foreground hover:bg-background transition-all disabled:opacity-25"
                >
                  <IconSkipForward className="w-[18px] h-[18px]" />
                </button>
              </div>

              {/* Sentence counter */}
              <div className="text-xs text-muted font-mono tabular-nums hidden sm:block">
                {speech.currentIndex >= 0 ? speech.currentIndex + 1 : 0}
                {" / "}
                {activeSentences.length}
              </div>

              {/* Speed */}
              <div
                className="flex items-center rounded-xl overflow-hidden border border-border"
                style={{ boxShadow: "var(--shadow)" }}
              >
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setRate(s)}
                    className={`px-3 py-2 text-xs font-medium transition-all ${
                      rate === s
                        ? "bg-accent text-white"
                        : "bg-surface text-muted hover:text-foreground hover:bg-background"
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

function IconSun({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function IconMoon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <circle cx="12" cy="12" r="10" className="opacity-20" />
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
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v14.72a1 1 0 001.5.86l11-7.36a1 1 0 000-1.72l-11-7.36A1 1 0 008 5.14z" />
    </svg>
  );
}

function IconPause({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function IconSkipBack({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 20a1 1 0 01-1.5.86L8 14.18V20a1 1 0 01-2 0V4a1 1 0 012 0v5.82l9.5-6.68A1 1 0 0119 4v16z" />
    </svg>
  );
}

function IconSkipForward({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
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

function IconGlobe({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <ellipse cx="12" cy="12" rx="4" ry="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
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
