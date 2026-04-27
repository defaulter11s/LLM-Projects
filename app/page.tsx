"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { upload } from "@vercel/blob/client";
import {
  Send,
  ImagePlus,
  X,
  Loader2,
  FileUp,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Wrench,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { DEFAULT_MANUAL, DEFAULT_MANUAL_NAME, DEFAULT_GREETING } from "@/lib/default-manual";

type Message = {
  role: "user" | "assistant";
  content: string;
  imageDataUrl?: string;
};

export default function HomePage() {
  // Manual state
  const [manual, setManual] = useState<string>(DEFAULT_MANUAL);
  const [manualPdfBase64, setManualPdfBase64] = useState<string | null>(null);
  const [manualName, setManualName] = useState<string>(DEFAULT_MANUAL_NAME);
  const [manualMeta, setManualMeta] = useState<{ chars: number; bytes?: number }>({
    chars: DEFAULT_MANUAL.length,
  });
  const [usingDefault, setUsingDefault] = useState(true);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: DEFAULT_GREETING },
  ]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // UI state
  const [dragActive, setDragActive] = useState(false);
  const [manualDetailsOpen, setManualDetailsOpen] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load suggestions when manual changes
  useEffect(() => {
    if (!manual && !manualPdfBase64) return;
    let cancelled = false;
    setSuggestionsLoading(true);
    const body: Record<string, unknown> = manualPdfBase64
      ? { manualPdfBase64 }
      : { manual };
    fetch("/api/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.questions)) {
          setSuggestions(data.questions);
        } else {
          // Silent failure — chips just won't appear. Don't surface as error.
          setSuggestions([]);
        }
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setSuggestionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [manual, manualPdfBase64]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  // Paste image handler
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            void readImageFile(file);
            e.preventDefault();
            return;
          }
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readImageFile = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      setError("Image too large. Please use an image under 8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === "string") {
        setPendingImage(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/upload-token",
      });

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: blob.url, name: file.name }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      if (data.kind === "pdf") {
        setManual("");
        setManualPdfBase64(data.base64);
        setManualMeta({ chars: 0, bytes: data.bytes });
      } else {
        setManual(data.text);
        setManualPdfBase64(null);
        setManualMeta({ chars: data.characters });
      }
      setManualName(data.name || file.name);
      setUsingDefault(false);

      setMessages([
        {
          role: "assistant",
          content: `Manual loaded: ${data.name}. Ready when you are — ask me anything from this manual.`,
        },
      ]);
      setSuggestions([]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadError(msg);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const resetToDefault = () => {
    setManual(DEFAULT_MANUAL);
    setManualPdfBase64(null);
    setManualName(DEFAULT_MANUAL_NAME);
    setManualMeta({ chars: DEFAULT_MANUAL.length });
    setUsingDefault(true);
    setMessages([{ role: "assistant", content: DEFAULT_GREETING }]);
    setUploadError(null);
    setSuggestions([]);
  };

  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text && !pendingImage) return;
    if (loading) return;

    const newUser: Message = {
      role: "user",
      content: text || "(image attached)",
      imageDataUrl: pendingImage || undefined,
    };
    const updated = [...messages, newUser];
    setMessages(updated);
    setInput("");
    setPendingImage(null);
    setLoading(true);
    setError(null);

    try {
      const apiMessages = updated.map((m) => ({
        role: m.role,
        content: m.content,
        imageDataUrl: m.imageDataUrl,
      }));

      const reqBody: Record<string, unknown> = {
        messages: apiMessages,
        manualName,
      };
      if (manualPdfBase64) {
        reqBody.manualPdfBase64 = manualPdfBase64;
      } else {
        reqBody.manual = manual;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }

      setMessages([...updated, { role: "assistant", content: data.reply || "" }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Drag-and-drop image
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (file.type.startsWith("image/")) {
        await readImageFile(file);
      }
    },
    []
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  return (
    <div
      className="min-h-screen relative"
      style={{ background: "var(--bg)" }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md"
        onChange={handleManualUpload}
        className="hidden"
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void readImageFile(f);
          e.target.value = "";
        }}
        className="hidden"
      />

      <div className="relative z-10 max-w-3xl mx-auto px-5 sm:px-8 pt-8 pb-44">
        {/* Header */}
        <header className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 flex items-center justify-center"
              style={{
                background: "var(--accent)",
                color: "var(--bg)",
                borderRadius: "2px",
              }}
            >
              <Wrench className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <div>
              <div className="label">Workshop Terminal · v1.2</div>
              <h1
                className="font-mono"
                style={{
                  fontSize: "26px",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                  color: "var(--text)",
                  marginTop: "4px",
                }}
              >
                DIAGNOSTIC ASSISTANT
              </h1>
            </div>
          </div>
        </header>

        {/* Manual status strip */}
        <div
          className="mb-6"
          style={{
            background: "var(--bg-elev)",
            border: "1px solid var(--line)",
            borderRadius: "3px",
          }}
        >
          <button
            onClick={() => setManualDetailsOpen(!manualDetailsOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: "var(--ok)" }}
              />
              <span className="label" style={{ color: "var(--text-dim)" }}>
                Manual
              </span>
              <span
                className="text-sm truncate"
                style={{ color: "var(--text)", fontWeight: 500 }}
              >
                {manualName}
              </span>
              {usingDefault && (
                <span
                  className="label flex-shrink-0 px-1.5 py-0.5"
                  style={{
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    letterSpacing: "0.15em",
                  }}
                >
                  DEMO
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="numeric label">
                {manualPdfBase64
                  ? `PDF · ${((manualMeta.bytes || 0) / 1024).toFixed(0)}KB`
                  : `${(manualMeta.chars / 1000).toFixed(1)}K`}
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  manualDetailsOpen ? "rotate-180" : ""
                }`}
                style={{ color: "var(--text-dim)" }}
              />
            </div>
          </button>
          {manualDetailsOpen && (
            <div
              className="px-4 py-3 fade-up"
              style={{ borderTop: "1px solid var(--line)" }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-xs flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50 chip"
                  style={{ color: "var(--text)" }}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Uploading
                    </>
                  ) : (
                    <>
                      <FileUp className="w-3 h-3" />
                      Upload manual (PDF, TXT, MD)
                    </>
                  )}
                </button>
                {!usingDefault && (
                  <button
                    onClick={resetToDefault}
                    className="text-xs flex items-center gap-1.5 px-3 py-1.5 chip"
                    style={{ color: "var(--text-dim)" }}
                  >
                    <RefreshCw className="w-3 h-3" />
                    Reset to demo
                  </button>
                )}
              </div>
              {uploadError && (
                <div
                  className="mt-3 text-xs px-3 py-2 flex items-start gap-2"
                  style={{
                    background: "rgba(224, 82, 76, 0.08)",
                    border: "1px solid rgba(224, 82, 76, 0.3)",
                    color: "var(--critical)",
                    borderRadius: "2px",
                  }}
                >
                  <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drop zone overlay (when dragging) */}
        {dragActive && (
          <div
            className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center"
            style={{
              background: "rgba(14, 14, 16, 0.85)",
            }}
          >
            <div
              className="px-8 py-6"
              style={{
                border: "2px dashed var(--accent)",
                borderRadius: "3px",
                background: "var(--accent-soft)",
              }}
            >
              <ImagePlus
                className="w-10 h-10 mb-3 mx-auto"
                style={{ color: "var(--accent)" }}
              />
              <div className="label" style={{ color: "var(--accent)" }}>
                Drop image to attach
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="space-y-5 mb-6">
          {messages.map((m, i) => (
            <MessageRow key={i} message={m} />
          ))}
          {loading && (
            <div className="flex gap-3 fade-up">
              <div
                className="w-7 h-7 flex items-center justify-center flex-shrink-0"
                style={{
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                  borderRadius: "2px",
                }}
              >
                <Wrench className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center gap-3 pt-1.5">
                <div className="tick-loader">
                  <span /><span /><span /><span /><span />
                </div>
                <span
                  className="label"
                  style={{ color: "var(--text-dim)" }}
                >
                  Reading manual
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div
            className="mb-4 px-3 py-2 text-xs flex items-start gap-2"
            style={{
              background: "rgba(224, 82, 76, 0.08)",
              border: "1px solid rgba(224, 82, 76, 0.3)",
              color: "var(--critical)",
              borderRadius: "2px",
            }}
          >
            <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Bottom composer + suggestions */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20"
        style={{
          background:
            "linear-gradient(to top, var(--bg) 0%, var(--bg) 70%, transparent 100%)",
          paddingTop: "32px",
        }}
      >
        <div className="max-w-3xl mx-auto px-5 sm:px-8 pb-5">
          {/* Suggestion chips */}
          {(suggestions.length > 0 || suggestionsLoading) && (
            <div className="mb-3">
              <div
                className="flex items-center gap-2 mb-2"
                style={{ color: "var(--text-dim)" }}
              >
                <Sparkles className="w-3 h-3" style={{ color: "var(--accent)" }} />
                <span className="label">Try asking</span>
                {suggestionsLoading && (
                  <Loader2
                    className="w-3 h-3 animate-spin"
                    style={{ color: "var(--text-dim)" }}
                  />
                )}
              </div>
              <div
                className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
                style={{ scrollbarWidth: "thin" }}
              >
                {suggestions.map((q, i) => (
                  <button
                    key={`${q}-${i}`}
                    disabled={loading}
                    onClick={() => sendMessage(q)}
                    className="chip chip-enter text-xs px-3 py-2 whitespace-nowrap flex-shrink-0"
                    style={{
                      color: "var(--text-dim)",
                      borderRadius: "2px",
                      animationDelay: `${i * 50}ms`,
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Composer */}
          <div
            className="input-shell flex items-end gap-2 p-2"
            style={{
              background: "var(--bg-elev)",
              border: "1px solid var(--line)",
              borderRadius: "3px",
              transition: "border-color 0.18s, box-shadow 0.18s",
            }}
          >
            {/* Image preview if pending */}
            {pendingImage && (
              <div className="flex-shrink-0 relative ml-1 mt-1">
                <img
                  src={pendingImage}
                  alt="Pending"
                  className="w-12 h-12 object-cover"
                  style={{ borderRadius: "2px" }}
                />
                <button
                  onClick={() => setPendingImage(null)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center"
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--line)",
                    borderRadius: "50%",
                    color: "var(--text)",
                  }}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            )}

            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={loading}
              className="p-2 flex-shrink-0 transition-colors disabled:opacity-50"
              style={{ color: "var(--text-dim)" }}
              title="Attach image (paste, drop, or click)"
            >
              <ImagePlus className="w-4 h-4" />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                pendingImage
                  ? "Describe the issue (or send image alone)..."
                  : "Ask about specs, intervals, procedures, or paste an image..."
              }
              disabled={loading}
              rows={1}
              className="flex-1 bg-transparent border-0 resize-none px-1 py-2 focus:outline-none"
              style={{
                color: "var(--text)",
                fontSize: "14px",
                lineHeight: 1.5,
                fontFamily: "inherit",
              }}
            />

            <button
              onClick={() => sendMessage()}
              disabled={loading || (!input.trim() && !pendingImage)}
              className="p-2 flex-shrink-0 disabled:opacity-30 transition-all"
              style={{
                background:
                  loading || (!input.trim() && !pendingImage)
                    ? "transparent"
                    : "var(--accent)",
                color:
                  loading || (!input.trim() && !pendingImage)
                    ? "var(--text-dim)"
                    : "var(--bg)",
                borderRadius: "2px",
              }}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Hint row */}
          <div
            className="mt-2 flex items-center justify-between"
            style={{ color: "var(--text-faint)", fontSize: "10px" }}
          >
            <span className="label">
              Drop, paste, or attach an image of your issue
            </span>
            <span className="label">Enter to send · Shift+Enter for new line</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Single message row with mechanic/rider styling */
function MessageRow({ message }: { message: Message }) {
  const isAssistant = message.role === "assistant";
  return (
    <div className="flex gap-3 fade-up">
      <div
        className="w-7 h-7 flex items-center justify-center flex-shrink-0"
        style={{
          background: isAssistant ? "var(--accent-soft)" : "var(--bg-elev-2)",
          color: isAssistant ? "var(--accent)" : "var(--text-dim)",
          borderRadius: "2px",
        }}
      >
        {isAssistant ? (
          <Wrench className="w-3.5 h-3.5" />
        ) : (
          <span
            className="font-mono"
            style={{ fontSize: "10px", fontWeight: 600 }}
          >
            YOU
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="label mb-1.5"
          style={{
            color: isAssistant ? "var(--accent)" : "var(--text-dim)",
          }}
        >
          {isAssistant ? "Mechanic" : "Rider"}
        </div>
        {message.imageDataUrl && (
          <div className="mb-2">
            <img
              src={message.imageDataUrl}
              alt="Attached"
              className="max-w-xs max-h-64 object-contain"
              style={{
                border: "1px solid var(--line)",
                borderRadius: "2px",
              }}
            />
          </div>
        )}
        <div className="msg-body">{renderContent(message.content)}</div>
      </div>
    </div>
  );
}

/**
 * Lightweight markdown rendering — bold, code spans, line breaks.
 * Avoids pulling in a full markdown library for what amounts to simple formatting.
 */
function renderContent(text: string): React.ReactNode {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <p key={i} style={{ margin: i === 0 ? "0 0 0.65em 0" : "0 0 0.65em 0" }}>
      {renderInline(line)}
    </p>
  ));
}

function renderInline(line: string): React.ReactNode {
  // Match **bold** and `code` spans
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(line)) !== null) {
    if (match.index > last) {
      parts.push(line.slice(last, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={key++}>{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<code key={key++}>{match[3]}</code>);
    }
    last = match.index + match[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts.length > 0 ? parts : line;
}
