import { NextRequest, NextResponse } from "next/server";
import { chat, ChatMessage } from "@/lib/llm";
import { buildSystemPrompt } from "@/lib/prompt";

export const runtime = "nodejs"; // Need Node runtime for full SDK support
export const maxDuration = 30;

type ChatRequestBody = {
  messages: ChatMessage[];
  manual: string;
  manualName?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequestBody;
    const { messages, manual, manualName } = body;

    // Validation
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages array is required" }, { status: 400 });
    }
    if (!manual || typeof manual !== "string" || manual.trim().length < 50) {
      return NextResponse.json(
        { error: "manual text is required (minimum 50 characters)" },
        { status: 400 }
      );
    }

    // Truncate the manual if it's absurdly large to stay within the free tier context.
    // Gemini 2.0 Flash supports up to 1M tokens, so this is a generous ceiling.
    const safeManual = manual.length > 500_000 ? manual.slice(0, 500_000) : manual;

    const systemPrompt = buildSystemPrompt(safeManual, manualName);

    const response = await chat(systemPrompt, messages);

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
