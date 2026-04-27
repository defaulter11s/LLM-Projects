"use client";

import { useState, useRef, useEffect } from "react";
import {
  Wrench, Send, ImagePlus, AlertTriangle, BookOpen, X, Loader2,
  ChevronRight, FileUp, FileText, CheckCircle2,
} from "lucide-react";

type PendingImage = {
  dataUrl: string;
  base64: string;
  mediaType: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  image?: PendingImage;
};

export default function HomePage() {
  // Manual state
  const [manual, setManual] = useState<string>("");
  const [manualName, setManualName] = useState<string>("");
  const [manualMeta, setManualMeta] = useState<{ pages?: number; chars: number } | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setManual(data.text);
      setManualName(data.name || file.name);
      setManualMeta({ pages: data.pages, chars: data.characters });
      setMessages([
        {
          role: "assistant",
          content: `Manual loaded: ${data.name}${data.pages ? ` (${data.pages} pages)` : ""}. Ask me anything about it — I'll only answer from what's in the document. You can also upload images of issues you're seeing.`,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadError(msg);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert("Image too large. Please use an image under 8MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      setPendingImage({ dataUrl, base64, mediaType: file.type });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text && !pendingImage) return;
    if (!manual) {
      alert("Please upload a manual first.");
      return;
    }

    const userMessage: Message = {
      role: "user",
      content: text || "Diagnose what you see in this image based on the manual.",
      image: pendingImage || undefined,
    };

    const updated = [...messages, userMessage];
    setMessages(updated);
    setInput("");
    setPendingImage(null);
    setLoading(true);
    setChatError(null);

    try {
      // Build payload — only send role/content/image, not display-only fields
      const apiMessages = updated.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.image
          ? { image: { base64: m.image.base64, mediaType: m.image.mediaType } }
          : {}),
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          manual,
          manualName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }

      setMessages([
        ...updated,
        { role: "assistant", content: data.reply || "(no response)" },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setChatError(msg);
      setMessages([
        ...updated,
        {
          role: "assistant",
          content: `Workshop diagnostics error: ${msg}. Please try again.`,
        },
      ]);
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

  const resetManual = () => {
    setManual("");
    setManualName("");
    setManualMeta(null);
    setMessages([]);
    setShowManual(false);
  };

  const quickPrompts = [
    "There's white smoke from the exhaust",
    "My bike won't start",
    "Brake lever feels spongy",
    "What's the service interval?",
  ];

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background:
          "radial-gradient(ellipse at top, #1c1917 0%, #0c0a09 50%, #000000 100%)",
      }}
    >
      <div className="grain hex-bg min-h-screen relative">
        <input
          ref={manualInputRef}
          type="file"
          accept=".pdf,.txt,.md"
          onChange={handleManualUpload}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
        />

        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-32 relative z-10">
          {/* Header */}
          <header className="mb-8">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{
                    background:
                      "linear-gradient(135deg, #F59E0B 0%, #B45309 100%)",
                    boxShadow: "0 0 20px rgba(245, 158, 11, 0.3)",
                  }}
                >
                  <Wrench className="w-5 h-5 text-black" strokeWidth={2.5} />
                </div>
                <div>
                  <div className="text-xs tracking-[0.3em] text-amber-500/70 font-mono">
                    WORKSHOP TERMINAL
                  </div>
                  <h1
                    className="text-stone-100 text-3xl sm:text-4xl leading-none font-display"
                    style={{ letterSpacing: "0.02em" }}
                  >
                    DIAGNOSTIC ASSISTANT
                  </h1>
                </div>
              </div>
              {manual && (
                <button
                  onClick={() => setShowManual(!showManual)}
                  className="flex items-center gap-2 px-3 py-2 rounded-md border border-stone-700 hover:border-amber-600 hover:bg-stone-900 transition-all text-stone-300 text-xs font-mono"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  MANUAL
                </button>
              )}
            </div>

            {manual && (
              <div className="flex items-center gap-3 text-xs font-mono">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/40 border border-emerald-800/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
                  <span className="text-emerald-300/90 truncate max-w-xs">
                    LOADED · {manualName}
                  </span>
                </div>
                {manualMeta && (
                  <span className="text-stone-500">
                    {manualMeta.pages ? `${manualMeta.pages}pp · ` : ""}
                    {(manualMeta.chars / 1000).toFixed(1)}k chars
                  </span>
                )}
                <button
                  onClick={resetManual}
                  className="text-stone-500 hover:text-red-400 ml-auto"
                  title="Clear manual"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </header>

          {/* No manual = upload prompt */}
          {!manual && (
            <div className="mt-12 mb-8 animate-slide-up">
              <div
                className="rounded-2xl border-2 border-dashed p-10 text-center"
                style={{
                  borderColor: uploading ? "#F59E0B" : "#44403c",
                  background: "rgba(28, 25, 23, 0.4)",
                }}
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-stone-900 border border-stone-700 mb-4">
                  {uploading ? (
                    <Loader2 className="w-7 h-7 text-amber-500 animate-spin" />
                  ) : (
                    <FileUp className="w-7 h-7 text-amber-500" />
                  )}
                </div>
                <h2 className="text-stone-100 text-2xl font-display mb-2 tracking-wider">
                  UPLOAD YOUR MANUAL
                </h2>
                <p className="text-stone-400 text-sm mb-6 max-w-md mx-auto leading-relaxed">
                  Drop a PDF, TXT, or Markdown file of your bike's owner manual.
                  All answers will be grounded strictly in this document.
                </p>
                <button
                  onClick={() => manualInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-black transition-all disabled:opacity-50"
                  style={{
                    background:
                      "linear-gradient(135deg, #F59E0B 0%, #B45309 100%)",
                    boxShadow: "0 4px 16px rgba(245, 158, 11, 0.3)",
                  }}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      EXTRACTING...
                    </>
                  ) : (
                    <>
                      <FileUp className="w-4 h-4" />
                      CHOOSE FILE
                    </>
                  )}
                </button>
                {uploadError && (
                  <div className="mt-4 text-sm text-red-400 max-w-md mx-auto">
                    {uploadError}
                  </div>
                )}
                <div className="mt-6 grid grid-cols-3 gap-4 max-w-sm mx-auto text-xs text-stone-500">
                  <div className="flex flex-col items-center gap-1">
                    <FileText className="w-4 h-4" />
                    PDF
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <FileText className="w-4 h-4" />
                    TXT
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <FileText className="w-4 h-4" />
                    MD
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Manual viewer */}
          {showManual && manual && (
            <div className="mb-6 rounded-lg border border-stone-800 bg-stone-950/60 overflow-hidden animate-slide-up">
              <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 bg-stone-900/50">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-500" />
                  <span className="text-stone-200 text-sm font-mono truncate">
                    {manualName}
                  </span>
                </div>
                <button
                  onClick={() => setShowManual(false)}
                  className="text-stone-500 hover:text-stone-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 max-h-80 overflow-y-auto">
                <pre className="text-stone-300 text-xs whitespace-pre-wrap font-mono">
                  {manual}
                </pre>
              </div>
            </div>
          )}

          {/* Messages */}
          {manual && (
            <div className="space-y-5">
              {messages.map((m, i) => (
                <div key={i} className="animate-slide-up">
                  {m.role === "assistant" ? (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center bg-stone-900 border border-amber-700/50">
                        <Wrench
                          className="w-4 h-4 text-amber-500"
                          strokeWidth={2.5}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] tracking-[0.25em] text-amber-600/80 mb-1.5 font-mono">
                          MECHANIC
                        </div>
                        <div
                          className="text-stone-200 leading-relaxed whitespace-pre-wrap"
                          style={{ fontSize: "15px" }}
                        >
                          {m.content}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3 justify-end">
                      <div className="flex-1 min-w-0 flex flex-col items-end">
                        <div className="text-[10px] tracking-[0.25em] text-stone-500 mb-1.5 font-mono">
                          YOU
                        </div>
                        <div
                          className="rounded-lg p-3 max-w-[85%]"
                          style={{
                            background: "rgba(28, 25, 23, 0.8)",
                            border: "1px solid rgba(120, 113, 108, 0.3)",
                          }}
                        >
                          {m.image && (
                            <img
                              src={m.image.dataUrl}
                              alt="upload"
                              className="rounded-md mb-2 max-w-full"
                              style={{ maxHeight: "200px" }}
                            />
                          )}
                          {m.content && (
                            <div
                              className="text-stone-100 leading-relaxed"
                              style={{ fontSize: "15px" }}
                            >
                              {m.content}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex gap-3 animate-slide-up">
                  <div className="w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center bg-stone-900 border border-amber-700/50">
                    <Wrench
                      className="w-4 h-4 text-amber-500"
                      strokeWidth={2.5}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-typing typing-dot" />
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-typing typing-dot" />
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-typing typing-dot" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Quick prompts */}
          {manual && messages.length === 1 && !loading && (
            <div className="mt-8">
              <div className="text-[10px] tracking-[0.25em] text-stone-500 mb-3 font-mono">
                COMMON ISSUES
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {quickPrompts.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(q)}
                    className="text-left px-3 py-2.5 rounded-md border border-stone-800 bg-stone-950/50 hover:border-amber-700/50 hover:bg-stone-900/50 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-stone-300 text-sm">{q}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-stone-600 group-hover:text-amber-500 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {chatError && (
            <div className="mt-4 px-4 py-3 rounded-lg bg-red-950/40 border border-red-800/50 text-red-300 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{chatError}</span>
            </div>
          )}
        </div>

        {/* Input bar - fixed bottom */}
        {manual && (
          <div
            className="fixed bottom-0 left-0 right-0 z-20"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.9) 30%, rgba(0,0,0,1) 100%)",
              paddingTop: "40px",
            }}
          >
            <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-4">
              {pendingImage && (
                <div className="mb-2 inline-flex items-center gap-2 bg-stone-900 border border-stone-700 rounded-md p-2 animate-slide-up">
                  <img
                    src={pendingImage.dataUrl}
                    alt="preview"
                    className="w-12 h-12 rounded object-cover"
                  />
                  <div className="text-xs text-stone-400">Image attached</div>
                  <button
                    onClick={() => setPendingImage(null)}
                    className="text-stone-500 hover:text-red-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div
                className="flex items-end gap-2 p-2 rounded-xl"
                style={{
                  background: "rgba(28, 25, 23, 0.95)",
                  border: "1px solid rgba(120, 113, 108, 0.4)",
                  backdropFilter: "blur(12px)",
                }}
              >
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="p-2.5 rounded-lg text-stone-400 hover:text-amber-400 hover:bg-stone-800 disabled:opacity-30 transition-colors"
                  title="Upload image"
                >
                  <ImagePlus className="w-5 h-5" />
                </button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    pendingImage
                      ? "Add context for the image (optional)..."
                      : "Describe the issue..."
                  }
                  rows={1}
                  disabled={loading}
                  className="flex-1 bg-transparent border-0 text-stone-100 placeholder:text-stone-500 resize-none focus:outline-none py-2"
                  style={{ fontSize: "15px", maxHeight: "120px" }}
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || (!input.trim() && !pendingImage)}
                  className="p-2.5 rounded-lg disabled:opacity-30 transition-all"
                  style={{
                    background:
                      loading || (!input.trim() && !pendingImage)
                        ? "#44403c"
                        : "linear-gradient(135deg, #F59E0B 0%, #B45309 100%)",
                    boxShadow:
                      !loading && (input.trim() || pendingImage)
                        ? "0 0 16px rgba(245, 158, 11, 0.3)"
                        : "none",
                  }}
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 text-stone-300 animate-spin" />
                  ) : (
                    <Send
                      className="w-5 h-5 text-black"
                      strokeWidth={2.5}
                    />
                  )}
                </button>
              </div>
              <div className="flex items-center justify-center gap-2 mt-3">
                <CheckCircle2 className="w-3 h-3 text-amber-700" />
                <span className="text-[11px] text-stone-500 font-mono">
                  ANSWERS RESTRICTED TO MANUAL CONTENT ONLY
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
