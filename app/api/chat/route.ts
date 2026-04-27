import { NextRequest, NextResponse } from "next/server";
import { chat, ChatMessage, ManualAttachment } from "@/lib/llm";
import { buildSystemPromptForText, buildSystemPromptForPdf } from "@/lib/prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatRequestBody = {
  messages: ChatMessage[];
  manualName?: string;
  /** Inline manual text (for default / .txt / .md uploads) */
  manual?: string;
  /** Or PDF base64 (for PDF uploads — Gemini reads natively) */
  manualPdfBase64?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequestBody;
    const { messages, manual, manualPdfBase64, manualName } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      );
    }

    let systemPrompt: string;
    let attachment: ManualAttachment | undefined;

    if (manualPdfBase64) {
      systemPrompt = buildSystemPromptForPdf(manualName);
      attachment = { kind: "pdf", base64: manualPdfBase64 };
    } else if (manual && manual.trim().length >= 50) {
      const safeManual = manual.length > 500_000 ? manual.slice(0, 500_000) : manual;
      systemPrompt = buildSystemPromptForText(safeManual, manualName);
      attachment = { kind: "text", text: safeManual };
    } else {
      return NextResponse.json(
        { error: "Either manual text or manualPdfBase64 is required" },
        { status: 400 }
      );
    }

    const response = await chat(systemPrompt, messages, attachment);

    if (response.error) {
      return NextResponse.json({ error: response.error }, { status: 500 });
    }

    return NextResponse.json({ reply: response.text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/chat] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
