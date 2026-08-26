# 🧠 CreatorMind — Your Autonomous Creator Growth Mind

> **UK AI Agent Hackathon EP4** · Animoca Minds Track · Anyway Track · OpenClaw Special Edition

CreatorMind is a production-oriented creator intelligence platform that turns content creation into a continuous observe → reason → act → learn → follow-up loop.

Instead of acting like a one-shot AI content generator, CreatorMind maintains long-term creator context, learns from approvals and rejections, grounds decisions in YouTube performance and audience signals, and proactively identifies what the creator should do next.

---

## 🧩 The Problem

Creators do not just need another tool that writes a script. They need an intelligent system that remembers what has worked, understands their audience, tracks their goals, and helps decide what to do next.

Most AI content tools operate like:

Prompt → Generate → Done

CreatorMind is designed around:

Goal → Observe → Remember → Reason → Act → Measure → Learn → Follow up

The continuous loop is the product.

---

## 💡 The Solution

CreatorMind deploys a **4+1 multi-agent orchestration pipeline** — four specialist AI agents (Hook, Script, Title, Strategy) coordinated by an Orchestrator — that converts one idea into a complete, reviewed content package. Creators approve or reject each artifact with structured feedback. That feedback is weighted, stored, and injected into every future run. The system learns continuously from rejections, approvals, and external YouTube performance data.

**Key outcomes:**

- One run → 4 coordinated artifacts ready for review

- Rejection reasoning deterministically modifies future prompts

- Approval triggers automatic "what worked" analysis written back to long-term memory

- External YouTube + OpenClaw data keeps agent context grounded in real-world performance

- Every run is fully observable via Anyway traces (cost, latency, tokens, errors, per-agent)

---

**## 🌟 What Makes CreatorMind Different

A normal chatbot:

Prompt → Answer → End

A content generator:

Idea → Content → Done

CreatorMind:

Goal
 ↓
Memory
 ↓
Observe
 ↓
Reason
 ↓
Act
 ↓
Measure
 ↓
Learn
 ↓
Follow up
 ↓
Act again

The product is not simply generating content. It is building a persistent feedback loop around one creator.

The Mind remembers

creator identity and niche

audience and goals

approvals and rejections

content preferences

performance patterns

ongoing experiments

previous decisions

The Mind acts

detects opportunities

analyzes performance

prepares content

creates experiments

updates memory

schedules follow-ups

Low-risk actions can be autonomous; public or irreversible actions remain creator-approved.

🏗️ Architecture Overview**

### Tech Stack

| Layer | Technology |

|---|---|

| Frontend | React + TypeScript |

| Backend / Auth | Supabase (Auth, RLS, Edge Functions, Storage, Webhooks) |

| AI Pipeline | OpenAI (GPT-4o for agents, DALL·E for thumbnails) |

| Billing | Stripe Subscriptions + Stripe Connect |

| Observability | Anyway (OTLP span export + OpenClaw plugin traces) |

| External Intelligence | YouTube Data API v3 + OpenClaw Worker Loop |

| Memory Store | Supabase PostgreSQL (scoped per-agent + global channel) |

### Agent Architecture: 4+1 Orchestrator Pattern

```

User Input (idea + project)

        │

        ▼

  ┌─────────────┐

  │ Orchestrator │  ← creates run row, compiles memory, routes agents, handles failures

  └──────┬──────┘

         │

    ┌────┴────┬──────────┬──────────┐

    ▼         ▼          ▼          ▼

HookAgent  ScriptAgent TitleAgent StrategyAgent

    │         │          │          │

    └────┬────┴──────────┴──────────┘

         ▼

   Artifacts stored (agent_name + version + status)

         │

         ▼

  Creator Review (approve / reject with feedback)

         │

    ┌────┴────────────────────────┐

    │                             │

Approval Path                Rejection Path

    │                             │

Auto-analysis               Feedback modal

"what worked" →             (agent-targeted or global)

long-term memory            Weighted memory write

                            → injected into next run

```

### Memory System

```

Memory Sources:

  ├── Scoped agent memory (per-agent feedback history)

  ├── Global channel memory (cross-agent learnings)

  ├── Approved artifact baseline (best run injected as anchor)

  ├── External insights (YouTube channel data, comments)

  └── OpenClaw inspiration refresh (daily automated sync)

Memory Compiler (per run, per agent):

  → Deterministic weighted compilation

  → Scoped to agent OR global (user-controlled)

  → Optional video-scope isolation

  → Injected into agent system prompt at run time

```

### OpenClaw Worker Loop

```

OpenClaw Scheduler (hourly)

  │

  ├── openclaw-pull-jobs   → fetches queued analysis jobs

  │       ↓

  │   Process: YouTube ingestion, inspiration channel sync

  │       ↓

  └── openclaw-push-insights → writes results to external_insights table

                                → triggers memory ingest path

                                → available in next agent run

```

---

## 🔌 Anyway Integration

CreatorMind integrates with Anyway via two independent trace-producing paths:

### Path 1: Run Pipeline OTLP Span Export

Every agent run emits structured spans to the Anyway collector:

```

Run Start

  ├── Span: OrchestratorAgent  { run_id, model, tokens, cost, latency, status }

  ├── Span: HookAgent          { agent_name, version, tokens, cost, latency, memory_applied, prompt_preview }

  ├── Span: ScriptAgent        { agent_name, version, tokens, cost, latency, memory_applied, prompt_preview }

  ├── Span: TitleAgent         { agent_name, version, tokens, cost, latency, memory_applied, prompt_preview }

  ├── Span: StrategyAgent      { agent_name, version, tokens, cost, latency, memory_applied, prompt_preview }

  └── Span: ThumbnailAgent     { agent_name, version, status, error? }

Each span includes:

  - trace_url        → deep link to Anyway trace viewer

  - model            → OpenAI model used

  - input_tokens     → prompt token count

  - output_tokens    → completion token count

  - cost_usd         → per-agent USD cost

  - latency_ms       → agent wall-clock time

  - memory_applied   → memory sources used (scoped / global / external)

  - external_insight_refs → OpenClaw/YouTube insight IDs injected

  - error            → failure metadata if agent failed

```

Spans are exported via OTLP POST to the Anyway collector endpoint (`run-pipeline/index.ts`).

### Path 2: OpenClaw Plugin Traces

The OpenClaw worker loop is instrumented with the Anyway agent plugin, producing independent traces for every background analysis job:

```

openclaw-pull-jobs  → Anyway trace (job type, source, queue depth)

openclaw-push-insights → Anyway trace (insight type, insight_id, memory_written)

```

### Observability UI

The Observability page in the app surfaces Anyway data directly to users:

- Per-run trace URL (deep link to Anyway)

- Per-agent: latency, tokens, cost, status, prompt preview

- Memory provenance (which memory sources were applied, which external insights were referenced)

- Analysis job board with retry controls

---

## 💳 Stripe Integration

### Subscription Billing (Live in Sandbox)

- Stripe Checkout subscription session creation

- Webhook sync for full subscription lifecycle (created → active → cancelled)

- Plan state reflected immediately in UI

- Run limits enforced by plan tier

- Pro plan gates thumbnail generation (real DALL·E image generation)

### Stripe Connect Backend

- `create-connect-account` edge function — creates Connect account

- `create-connect-checkout-session` edge function — initiates Connect checkout with application fee + transfer destination

- Backend infrastructure ready for marketplace/platform-fee monetisation flows

---

## 📺 YouTube Intelligence

- OAuth 2.0 connect flow with encrypted token storage

- Channel metadata, video stats, and comment ingestion into `external_insights`

- Inspiration channel sync — add competitor/inspiration channels for automatic monitoring

- Token refresh handling for long-lived connections

---

## 🔐 Auth & Security

- Supabase email/password auth with profile auto-provisioning

- Row-Level Security (RLS) enforced on all user-owned data

- Service-role-only writes for pipeline/webhook/worker operations

- OAuth token encryption for YouTube credentials

- Protected routes with mandatory onboarding gate

---

## ⚙️ Setup & Installation

### Prerequisites

- Node.js 18+

- Supabase CLI

- Stripe CLI (for webhook testing)

- OpenAI API key

- YouTube Data API v3 credentials

- Anyway collector endpoint + API key

### 1. Clone the Repository

```bash

git clone https://github.com/puneetnith28/creatormind.git

cd creatormind

npm install

```

### 2. Environment Variables

Create a `.env.local` file in the project root:

```env

# Supabase

NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url

NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI

OPENAI_API_KEY=your_openai_api_key

# Stripe

STRIPE_SECRET_KEY=your_stripe_secret_key

STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

STRIPE_CONNECT_CLIENT_ID=your_connect_client_id

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key

# YouTube

YOUTUBE_CLIENT_ID=your_youtube_oauth_client_id

YOUTUBE_CLIENT_SECRET=your_youtube_oauth_client_secret

YOUTUBE_REDIRECT_URI=http://localhost:3000/api/youtube/callback

# Anyway (Supabase Edge Functions runtime env)

ANYWAY_API_KEY=your_anyway_sdk_api_key

ANYWAY_API_URL=https://trace-dev-collector.anyway.sh

ANYWAY_TRACE_BASE_URL=https://webapp.anyway.sh

# OpenClaw

OPENCLAW_API_KEY=your_openclaw_api_key

OPENCLAW_WORKER_SECRET=your_openclaw_worker_secret

```

### 3. Database Setup

```bash

# Link to your Supabase project

supabase link --project-ref YOUR_PROJECT_REF

# Run migrations

supabase db push

# Or apply migrations manually

supabase migration up

```

### 4. Deploy Edge Functions

```bash

supabase functions deploy run-pipeline

supabase functions deploy create-connect-account

supabase functions deploy create-connect-checkout-session

supabase functions deploy youtube-oauth-callback

supabase functions deploy stripe-webhook

supabase functions deploy openclaw-pull-jobs

supabase functions deploy openclaw-push-insights

```

### 5. Start Development Server

```bash

npm run dev

```

### 6. Start OpenClaw Worker (Local)

```bash

# Run the local worker script

node scripts/openclaw-worker.js

# Or with OpenAI enhancement mode

OPENCLAW_ENHANCE=true node scripts/openclaw-worker.js

```

### 7. Stripe Webhook (Local Testing)

```bash

stripe listen --forward-to localhost:3000/api/stripe-webhook

```


---

## 🏆 Creative Minds Jam #1 Alignment

**### Animoca Minds — Audience Growth & Engagement

Requirement

CreatorMind implementation

Persistent Mind

Creator-specific long-term Mind

Memory

Preferences, decisions, performance, experiments and external signals

Continuity

Goals, experiments, pending actions and historical context survive across sessions

Autonomous follow-up

Background analysis and proactive opportunity generation

Genuine creator problem

Audience growth, content strategy and creator decision fatigue

Mind is integral

The Mind owns the persistent creator-growth loop

Multi-agent architecture

Persistent Mind + Hook, Script, Title and Strategy agents

Core product loop:

Goal → Observe → Reason → Opportunity → Act → Measure → Learn → Follow up

Anyway — Agent Tracing + Commercialisation**

| Requirement | Implementation |

|---|---|

| **SDK / Trace Collection** | OTLP spans emitted per agent run + OpenClaw plugin traces |

| **Stripe Connect** | `create-connect-account` + `create-connect-checkout-session` edge functions |

| **Sandbox Revenue** | Stripe subscription checkout + webhook sync working in sandbox |

### OpenClaw — Special Edition Partner

| Requirement | Implementation |

|---|---|

| **Worker Protocol** | `openclaw-pull-jobs` + `openclaw-push-insights` bidirectional protocol |

| **Production Reliability** | Retry/backoff/dead-letter handling in worker loop |

| **Agent Ecosystem** | OpenClaw drives daily inspiration refresh + hourly insight analysis into agent memory |

---

## 👥 Team

Built for Creative Minds Jam #1 — Animoca Minds Track.

---
