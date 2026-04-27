# Workshop Diagnostic Terminal — Bike Manual Assistant

A workshop-grade diagnostic assistant that answers questions strictly from your bike's owner's manual. Built with Next.js + Gemini 2.5 Flash + Vercel Blob, deploys free on Vercel.

## What it does

- **Manual-grounded answers** — the assistant only answers from the manual you load. No hallucinated specs, no "best guess from a similar bike". If the manual doesn't cover it, the assistant says so and points you to a service centre.
- **PDF-native ingestion** — drop in any owner's manual PDF (up to 15 MB). Gemini reads it directly, including tables, layouts, and inline diagrams. No client-side text extraction. Works on any manual without per-bike configuration.
- **Smart starter questions** — when a manual loads, the assistant scans it and surfaces 6 questions it can confidently answer. Riders tap-to-ask. Different manuals produce different chips — an electric bike won't show "what's the oil grade?", a petrol bike will.
- **Image diagnostics** — paste, drop, or attach a photo of an issue (oil leak, warning light, worn part). Gemini compares it to the manual and answers.
- **Bundled demo** — Royal Enfield Classic 350 manual digest is loaded by default, so the app is usable the moment you open it. Replace by uploading your own.

## Architecture

```
┌────────────────────────────┐
│   Browser (Next.js page)   │
│  · Drag/paste image input  │
│  · Tap-to-ask suggestions  │
│  · Direct-to-Blob uploads  │
└──────────────┬─────────────┘
               │
               ▼
┌────────────────────────────┐
│   Vercel serverless        │
│   /api/upload-token        │  → signs Blob upload URLs (bypass 4.5 MB limit)
│   /api/upload              │  → fetch Blob, return text or PDF base64
│   /api/suggestions         │  → JSON of 6 likely questions from the manual
│   /api/chat                │  → grounded conversational answers
└──────────────┬─────────────┘
               │
               ▼
┌────────────────────────────┐
│   Google Gemini 2.5 Flash  │
│   · 1M token context       │
│   · Native PDF input       │
│   · Vision for images      │
└────────────────────────────┘
```

## Deploy guide — same flow as the insurance app

If you've already deployed `insurance-agent`, the steps are identical. Three websites, ~10 minutes.

### Step 1 — Get a Gemini API key (skip if you already have one)

Use your existing key, or create a new one at <https://aistudio.google.com/app/apikey>. Free tier covers learning use comfortably.

### Step 2 — GitHub

1. Unzip the project on your computer
2. Show hidden files (Mac: `Cmd + Shift + .` / Windows: View → Hidden items)
3. Create a fresh repo at <https://github.com/new> named `bike-troubleshooter`. Leave init checkboxes unchecked.
4. On the empty repo page, click "uploading an existing file"
5. Select all 12 items inside the unzipped folder (NOT the wrapper folder), drag in
6. Verify `.env.example`, `.gitignore`, `app/`, `lib/` are present
7. Commit message: `Initial commit` → Commit changes

### Step 3 — Vercel

1. <https://vercel.com/new> → import the `bike-troubleshooter` repo
2. Before clicking Deploy, expand **Environment Variables** and add:
   - Name: `GEMINI_API_KEY`
   - Value: your key
3. Click **Deploy** — wait ~90 seconds

### Step 4 — Provision a Blob store (for PDF uploads)

If you only want the bundled demo, skip this. But upload-at-runtime requires Blob.

1. Vercel project → **Storage** tab → **Create Database** → **Blob**
2. Name it `manuals`, pick a nearby region, click **Create**
3. Connect it to the `bike-troubleshooter` project when prompted
4. Vercel auto-injects `BLOB_READ_WRITE_TOKEN`
5. Trigger a redeploy: **Deployments** → click `⋯` on the latest → **Redeploy**

### Step 5 — Test

Open your live URL. The bundled Royal Enfield Classic 350 manual loads automatically. Within a few seconds, 6 suggested questions should appear above the input.

**Useful tests:**

- Tap one of the suggested chips — should produce a precise answer pulled from the manual
- Type "What's the front tyre pressure?" — should answer "32 psi (2.2 bar)"
- Type "What oil grade do I need?" — should answer "SAE 15W-50, API SL or higher, JASO MA2"
- Type "Does it have ABS?" — answer should reference the ABS warning light section
- Type "What's the warranty period?" — should answer "3 years or 30,000 km"
- Type "Can I use E20 fuel?" — should refuse cleanly and note the bike is E10-only
- Type "What's the 0-100 time?" — should refuse: not in the manual

**Image test:**
- Find any image of a motorcycle warning light or oil leak online
- Paste it into the chat (Cmd+V on Mac, Ctrl+V on Windows) or drag-drop
- Add a question like "what is this?" and send
- The assistant should describe what it sees and cross-reference the manual

**Upload test:**
- Click the manual status strip at top of page → expand → Upload manual
- Upload any motorcycle manual PDF (try a real one)
- The assistant re-grounds; new starter questions appear within ~5 seconds
- Ask questions specific to the new bike

## File structure

```
bike-troubleshooter/
├── app/
│   ├── api/
│   │   ├── chat/route.ts            Manual-grounded chat
│   │   ├── suggestions/route.ts     Generates starter questions
│   │   ├── upload/route.ts          Fetch Blob, return text or PDF base64
│   │   └── upload-token/route.ts    Sign Blob upload URLs
│   ├── globals.css                  Workshop terminal aesthetic
│   ├── layout.tsx
│   └── page.tsx                     Main UI
├── lib/
│   ├── default-manual.ts            Bundled Royal Enfield Classic 350 digest
│   ├── llm.ts                       Gemini wrapper with image + PDF support
│   └── prompt.ts                    System prompts (chat + suggestions)
├── .env.example
├── .gitignore
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
└── README.md
```

## How the manual grounding works

The system prompt in `lib/prompt.ts` enforces:

- **Strict grounding** — answers come only from the manual. The fallback phrase is fixed: *"I don't see that covered in the manual. I'd recommend visiting your authorised service centre for this."*
- **Precision on numbers** — quote tyre pressures, oil capacities, torques, and intervals exactly as the manual states. Include units.
- **Procedure fidelity** — for adjustment tasks, give the steps the manual lists, in order. No invented intermediate steps.
- **Safety surfacing** — for brakes, tyres, electrical issues, the assistant proactively surfaces the manual's warnings rather than glossing them over.
- **Prompt injection resistance** — attempts to override the rules trigger a polite redirect.

## How starter questions work

After a manual loads, `app/page.tsx` calls `/api/suggestions`, which sends the manual to Gemini with a prompt asking for **6 questions you can confidently answer from this specific manual, in JSON format**. Gemini returns something like:

```json
{
  "questions": [
    "What's the recommended tyre pressure?",
    "How often should I change the engine oil?",
    "What oil grade does it need?",
    "What does the orange ABS light mean?",
    "How do I adjust the chain tension?",
    "What's the fuel tank capacity?"
  ]
}
```

The chips render with a staggered fade-in. Tapping one sends the question as a chat message.

This works for any manual — different bikes produce different chips. Electric bikes won't see oil questions; older bikes might see questions about choke procedures.

## Common problems

**"Upload failed: Request Entity Too Large"**
You skipped Step 4. Provision a Blob store and redeploy.

**"BLOB_READ_WRITE_TOKEN environment variable is not set"**
Same as above — Blob store not provisioned, or wasn't connected to this project, or the project wasn't redeployed after connecting.

**Suggested questions don't appear**
Three possible reasons:
1. Gemini rate limit (free tier is ~10 requests/minute — refresh in a minute)
2. The manual is very short or doesn't contain enough recognisable structure
3. Network blip — refresh the page

The chat itself works fine without suggestions; they're additive.

**The assistant says it can't answer something I'm sure is in the manual**
Two possibilities:
1. The PDF is image-based/scanned. Gemini can read most scanned PDFs, but quality varies. Try a text-based PDF from the manufacturer's website.
2. The phrasing of your question doesn't match the manual's terminology. Try rephrasing — e.g., "service interval" instead of "how often to take it in".

**Image attachment fails silently**
Images must be under 8 MB. Some browsers limit clipboard image quality — try drag-drop or the file picker instead.

## Free tier costs

- **Gemini 2.5 Flash**: free, ~10 RPM, ~250 RPD. Suggestions + chat both use this.
- **Vercel Hobby**: free, 100 GB bandwidth/month
- **Vercel Blob**: free up to 1 GB. Each PDF is deleted immediately after processing, so the practical usage is ~5 seconds per upload.

For demo and learning use, this is genuinely free. Each chat turn is a few cents on paid Gemini if you scale up, and each suggestions call is also a few cents (called only once per manual load).

## Customisation

**Change the bundled manual**: edit `lib/default-manual.ts`. Replace `DEFAULT_MANUAL` with your own bike's manual content (any plain-text format). Update `DEFAULT_MANUAL_NAME` and `DEFAULT_GREETING` to match.

**Tweak the assistant's tone**: edit `COMMON_RULES` in `lib/prompt.ts`. The current tone is "knowledgeable workshop mechanic" — direct, precise, safety-conscious. You could shift it more conversational, or more formal-technical, by adjusting the wording.

**Adjust the suggestion count**: in `app/api/suggestions/route.ts`, change `slice(0, 6)`. Six is the sweet spot for a horizontal scroll without overwhelming.

**Swap the LLM**: replace the implementation in `lib/llm.ts`. Anthropic Claude or OpenAI GPT-4 swap in cleanly — the rest of the app talks to `lib/llm.ts` through a stable interface.

## License

MIT — use it however you want.
