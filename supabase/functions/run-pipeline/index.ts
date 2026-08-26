import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini";
const OPENAI_IMAGE_MODEL = Deno.env.get("OPENAI_IMAGE_MODEL") ?? "gpt-image-1";
const AGENT_VERSION = "v2";
const SERVICE_NAME = "studio-mind-run-pipeline";
const THUMBNAIL_STYLE_BASELINE = [
  "Create a high-CTR YouTube-style thumbnail in a bold creator aesthetic.",
  "Composition guidance:",
  "- Large expressive human subject on one side with strong emotion and clear face visibility.",
  "- Main object/topic on the opposite side, isolated and instantly recognizable.",
  "- Add a thick red directional arrow pointing to the main object/topic.",
  "- Add a short uppercase headline (2-4 words) with thick dark outline and neon/bright fill.",
  "- Use bright sky/green-ground or similarly vivid high-contrast background.",
  "- Saturated colors, sharp edges, heavy contrast, subtle drop shadows, clean cutout feel.",
  "- Keep layout simple and readable at small size.",
  "Hard constraints:",
  "- No watermarks, no logos, no small unreadable text, no cluttered scenes.",
].join("\n");

type AgentName = "HookAgent" | "ScriptAgent" | "TitleAgent" | "StrategyAgent";
type ArtifactType = "hook" | "script" | "title" | "strategy" | "thumbnail";

type AgentDefinition = {
  name: AgentName;
  artifactType: ArtifactType;
  systemPrompt: string;
  qualityChecklist: string[];
};

type RunContext = {
  userId: string;
  runId: string;
  videoId: string;
  title: string;
  description: string | null;
  isPro: boolean;
  memoryByAgent: Record<AgentName, CompiledMemory>;
  channelBaselineText: string;
};

type AgentOutput = {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptText: string;
  rawJson: Record<string, unknown>;
};

type AgentExecutionMetrics = {
  agent_name: AgentName;
  artifact_type: ArtifactType;
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  status: "completed" | "failed";
  error_message: string | null;
  prompt_text: string;
};

type SpanAttr = { key: string; value: Record<string, unknown> };

type SpanRecord = {
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  statusCode: number;
  statusMessage?: string;
  attributes: SpanAttr[];
};

type MemoryRow = {
  id: string;
  key: string;
  value: Record<string, unknown>;
  source: string;
  video_id: string | null;
  agent_name: string | null;
  priority: number;
  updated_at: string;
};

type FeedbackRow = {
  id: string;
  reason_code: string;
  free_text: string | null;
  agent_name: string | null;
  applies_globally: boolean;
  feedback_weight: number;
  created_at: string;
  video_id: string;
};

type CompiledMemory = {
  constraintsText: string;
  appliedMemoryRows: Array<{ id: string; key: string; priority: number }>;
  appliedFeedbackRows: Array<{ id: string; reason_code: string; feedback_weight: number }>;
};

type ExternalInsightRow = {
  id: string;
  source: string;
  insight_type: string;
  insights: Array<Record<string, unknown>>;
  raw_summary: string | null;
  created_at: string;
};

type ExportResult = {
  status: "success" | "failed" | "skipped";
  error: string | null;
};

type ChannelBaseline = {
  text: string;
  applied: Record<string, unknown>;
};

const MODEL_PRICING_PER_1M: Record<string, { input: number; output: number }> = {
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

const AGENTS: AgentDefinition[] = [
  {
    name: "HookAgent",
    artifactType: "hook",
    systemPrompt:
      "You are HookAgent. Generate concise, high-retention opening hooks for social video content.",
    qualityChecklist: [
      "Keep lines punchy and specific",
      "Avoid generic clickbait filler",
      "Favor concrete value proposition in first sentence",
    ],
  },
  {
    name: "ScriptAgent",
    artifactType: "script",
    systemPrompt:
      "You are ScriptAgent. Write creator-ready short-form scripts with a clear beginning, beats, and close.",
    qualityChecklist: [
      "Keep pacing fast and readable",
      "Use short lines and clear transitions",
      "End with a direct CTA",
    ],
  },
  {
    name: "TitleAgent",
    artifactType: "title",
    systemPrompt:
      "You are TitleAgent. Craft high-CTR title options and thumbnail direction that fit the audience and topic.",
    qualityChecklist: [
      "Titles must be clear and not misleading",
      "Prioritize curiosity with specificity",
      "Thumbnail direction must be visually concrete",
    ],
  },
  {
    name: "StrategyAgent",
    artifactType: "strategy",
    systemPrompt:
      "You are StrategyAgent. Provide practical publishing and retention strategy for creator growth.",
    qualityChecklist: [
      "Recommend one measurable retention tactic",
      "Recommend one posting optimization",
      "Tailor guidance to the provided topic",
    ],
  },
];

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function nowNano(): string {
  return (BigInt(Date.now()) * 1_000_000n).toString();
}

function spanAttrString(key: string, value: string): SpanAttr {
  return { key, value: { stringValue: value } };
}

function spanAttrInt(key: string, value: number): SpanAttr {
  return { key, value: { intValue: String(Math.trunc(value)) } };
}

function spanAttrDouble(key: string, value: number): SpanAttr {
  return { key, value: { doubleValue: value } };
}

function normalizeCollectorUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes("/v1/traces")) return trimmed;
  if (trimmed.endsWith("/")) return `${trimmed}v1/traces`;
  return `${trimmed}/v1/traces`;
}

async function exportTrace(traceId: string, spans: SpanRecord[], runId: string): Promise<ExportResult> {
  const apiKey = Deno.env.get("ANYWAY_API_KEY");
  const configuredCollector = normalizeCollectorUrl(Deno.env.get("ANYWAY_API_URL"));
  const collectorCandidates = Array.from(
    new Set(
      [
        configuredCollector,
        "https://trace-dev-collector.anyway.sh/v1/traces",
        "https://collector.anyway.sh/v1/traces",
        "https://api.anyway.sh/v1/traces",
      ].filter((item): item is string => Boolean(item)),
    ),
  );

  if (!apiKey || collectorCandidates.length === 0 || spans.length === 0) {
    return { status: "skipped", error: null };
  }

  const payload = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            spanAttrString("service.name", SERVICE_NAME),
            spanAttrString("deployment.environment", Deno.env.get("DENO_DEPLOYMENT_ID") ? "production" : "development"),
            spanAttrString("studio.run_id", runId),
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: "studio-mind.observability",
              version: "1.0.0",
            },
            spans: spans.map((span) => ({
              traceId,
              spanId: span.spanId,
              parentSpanId: span.parentSpanId,
              name: span.name,
              kind: 1,
              startTimeUnixNano: span.startTimeUnixNano,
              endTimeUnixNano: span.endTimeUnixNano,
              attributes: span.attributes,
              status: {
                code: span.statusCode,
                message: span.statusMessage,
              },
            })),
          },
        ],
      },
    ],
  };

  let lastError: string | null = null;
  for (const collector of collectorCandidates) {
    const authHeaders = [
      { Authorization: apiKey },
      { Authorization: `Bearer ${apiKey}` },
      { "x-api-key": apiKey },
    ];

    for (const authHeader of authHeaders) {
      try {
        const response = await fetch(collector, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeader,
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          return { status: "success", error: null };
        }

        const text = await response.text().catch(() => "");
        lastError = `Collector returned ${response.status}: ${text.slice(0, 300)}`;

        // Treat auth/availability problems as non-fatal to keep demo runs clean.
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          continue;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Collector export failed";
        lastError = message;
      }
    }
  }

  if (lastError && (lastError.includes("Connection refused") || lastError.includes("Collector returned 403"))) {
    return { status: "skipped", error: null };
  }
  return { status: "failed", error: lastError };
}

function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING_PER_1M[model] ?? MODEL_PRICING_PER_1M["gpt-4.1-mini"];
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  return Number((inputCost + outputCost).toFixed(4));
}

function buildTrace(): { traceId: string; traceUrl: string | null } {
  const traceId = randomHex(16);
  const base = Deno.env.get("ANYWAY_TRACE_BASE_URL") ?? "";

  if (!base) {
    return { traceId, traceUrl: null };
  }

  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return { traceId, traceUrl: `${normalizedBase}/traces/${traceId}` };
}

function memoryValueToText(value: Record<string, unknown>): string {
  if (typeof value.latest_free_text === "string" && value.latest_free_text.trim()) {
    return value.latest_free_text.trim();
  }

  if (Array.isArray(value.examples) && value.examples.length > 0) {
    const latest = value.examples[value.examples.length - 1] as Record<string, unknown>;
    if (typeof latest.free_text === "string" && latest.free_text.trim()) {
      return latest.free_text.trim();
    }
  }

  return JSON.stringify(value);
}

function reasonToConstraint(reasonCode: string): string {
  if (reasonCode === "too_long") return "Keep output shorter and remove filler language.";
  if (reasonCode === "not_engaging") return "Increase specificity, novelty, and practical payoff in the opening.";
  if (reasonCode === "wrong_tone") return "Adjust tone to match user preference and audience context.";
  if (reasonCode === "poor_hook") return "Strengthen first line hook with sharper tension or curiosity.";
  return "Address the user-provided rejection notes directly.";
}

function compileAgentMemory(
  agent: AgentName,
  videoId: string,
  memoryRows: MemoryRow[],
  feedbackRows: FeedbackRow[],
): CompiledMemory {
  const inOrderMemory = [
    ...memoryRows
      .filter((row) => row.agent_name === agent && row.video_id === videoId)
      .sort((a, b) => b.priority - a.priority || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    ...memoryRows
      .filter((row) => row.agent_name === agent && row.video_id === null)
      .sort((a, b) => b.priority - a.priority || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    ...memoryRows
      .filter((row) => row.agent_name === null && row.video_id === videoId)
      .sort((a, b) => b.priority - a.priority || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    ...memoryRows
      .filter((row) => row.agent_name === null && row.video_id === null)
      .sort((a, b) => b.priority - a.priority || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
  ].slice(0, 12);

  const scopedFeedback = feedbackRows
    .filter((row) => {
      const agentMatches = row.agent_name === agent;
      const globalMatch = row.applies_globally || row.agent_name === null;
      const videoMatches = row.video_id === videoId || row.applies_globally;
      return (agentMatches || globalMatch) && videoMatches;
    })
    .sort((a, b) => b.feedback_weight - a.feedback_weight || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  const hardConstraints = scopedFeedback.map((feedback) => {
    const base = reasonToConstraint(feedback.reason_code);
    if (feedback.free_text) return `${base} User note: ${feedback.free_text}`;
    return base;
  });

  const stylePreferences = inOrderMemory
    .filter((row) => row.key.includes("preference") || row.key.includes("tone") || row.key.includes("style") || row.key.includes("length"))
    .map((row) => `${row.key}: ${memoryValueToText(row.value)}`)
    .slice(0, 6);

  const recentFailures = scopedFeedback
    .slice(0, 5)
    .map((row) => `${row.reason_code}${row.free_text ? ` - ${row.free_text}` : ""} (weight ${row.feedback_weight})`);

  const constraints = [
    "CONSTRAINTS",
    `Hard constraints:\n${hardConstraints.length ? hardConstraints.map((line) => `- ${line}`).join("\n") : "- None"}`,
    `Style preferences:\n${stylePreferences.length ? stylePreferences.map((line) => `- ${line}`).join("\n") : "- None"}`,
    `Recent failure reasons:\n${recentFailures.length ? recentFailures.map((line) => `- ${line}`).join("\n") : "- None"}`,
  ].join("\n\n");

  return {
    constraintsText: constraints,
    appliedMemoryRows: inOrderMemory.map((row) => ({ id: row.id, key: row.key, priority: row.priority })),
    appliedFeedbackRows: scopedFeedback.map((row) => ({
      id: row.id,
      reason_code: row.reason_code,
      feedback_weight: row.feedback_weight,
    })),
  };
}

async function loadCompiledMemory(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  videoId: string,
): Promise<Record<AgentName, CompiledMemory>> {
  const [{ data: memoryData }, { data: feedbackData }] = await Promise.all([
    adminClient
      .from("agent_memory")
      .select("id, key, value, source, video_id, agent_name, priority, updated_at")
      .eq("user_id", userId)
      .or(`video_id.eq.${videoId},video_id.is.null`)
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(100),
    adminClient
      .from("run_feedback")
      .select("id, reason_code, free_text, agent_name, applies_globally, feedback_weight, created_at, video_id")
      .eq("user_id", userId)
      .or(`video_id.eq.${videoId},applies_globally.eq.true`)
      .order("feedback_weight", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const rows = ((memoryData || []) as unknown[]).map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: String(row.id),
      key: String(row.key),
      value: (row.value ?? {}) as Record<string, unknown>,
      source: String(row.source ?? "unknown"),
      video_id: (row.video_id as string | null) ?? null,
      agent_name: (row.agent_name as string | null) ?? null,
      priority: Number(row.priority ?? 1),
      updated_at: String(row.updated_at ?? new Date(0).toISOString()),
    } as MemoryRow;
  });

  const feedbackRows = ((feedbackData || []) as unknown[]).map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: String(row.id),
      reason_code: String(row.reason_code),
      free_text: (row.free_text as string | null) ?? null,
      agent_name: (row.agent_name as string | null) ?? null,
      applies_globally: Boolean(row.applies_globally),
      feedback_weight: Number(row.feedback_weight ?? 1),
      created_at: String(row.created_at ?? new Date(0).toISOString()),
      video_id: String(row.video_id),
    } as FeedbackRow;
  });

  return {
    HookAgent: compileAgentMemory("HookAgent", videoId, rows, feedbackRows),
    ScriptAgent: compileAgentMemory("ScriptAgent", videoId, rows, feedbackRows),
    TitleAgent: compileAgentMemory("TitleAgent", videoId, rows, feedbackRows),
    StrategyAgent: compileAgentMemory("StrategyAgent", videoId, rows, feedbackRows),
  };
}

async function loadChannelBaseline(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<ChannelBaseline> {
  const [{ data: profile }, { data: preference }, { data: inspirations }] = await Promise.all([
    adminClient
      .from("profiles")
      .select("channel_summary_prompt, channel_style_goal")
      .eq("user_id", userId)
      .maybeSingle(),
    adminClient
      .from("channel_preferences")
      .select("tone, pacing, hook_style, script_length_preference, banned_phrases, cta_style, notes")
      .eq("user_id", userId)
      .maybeSingle(),
    adminClient
      .from("channel_inspirations")
      .select("youtube_url, note")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const lines = [
    "CHANNEL STYLE BASELINE",
    `Channel goal: ${profile?.channel_style_goal ?? "not set"}`,
    `Summary prompt: ${profile?.channel_summary_prompt ?? "not set"}`,
    `Tone: ${preference?.tone ?? "not set"}`,
    `Pacing: ${preference?.pacing ?? "not set"}`,
    `Hook style: ${preference?.hook_style ?? "not set"}`,
    `Script length preference: ${preference?.script_length_preference ?? "not set"}`,
    `Banned phrases: ${Array.isArray(preference?.banned_phrases) && preference?.banned_phrases.length > 0 ? preference.banned_phrases.join(", ") : "none"}`,
    `CTA style: ${preference?.cta_style ?? "not set"}`,
    `Notes: ${preference?.notes ?? "none"}`,
    `Inspirations: ${(inspirations || []).length > 0
      ? (inspirations || []).map((item) => `${item.youtube_url}${item.note ? ` (${item.note})` : ""}`).join("; ")
      : "none"}`,
  ];

  return {
    text: lines.join("\n"),
    applied: {
      channel_summary_prompt: profile?.channel_summary_prompt ? true : false,
      channel_style_goal: profile?.channel_style_goal ? true : false,
      channel_preferences: preference ? true : false,
      channel_inspirations_count: (inspirations || []).length,
    },
  };
}

function formatTitleAgentContent(parsed: Record<string, unknown>, isPro: boolean): string {
  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  const thumbnailBrief = typeof parsed.thumbnail_brief === "string" ? parsed.thumbnail_brief.trim() : "";
  const imagePrompt = typeof parsed.image_prompt === "string" ? parsed.image_prompt.trim() : "";
  const fallbackContent = typeof parsed.content === "string" ? parsed.content.trim() : "";

  if (!title && fallbackContent) return fallbackContent;

  const lines = [
    `Title:\n${title || "(not provided)"}`,
    `Thumbnail Brief:\n${thumbnailBrief || "(not provided)"}`,
  ];

  if (isPro) {
    lines.push(`Image Prompt:\n${imagePrompt || "(not provided)"}`);
  }

  return lines.join("\n\n");
}

function extractTitleImagePrompt(parsed: Record<string, unknown>): string | null {
  if (typeof parsed.image_prompt === "string" && parsed.image_prompt.trim()) {
    return parsed.image_prompt.trim();
  }
  return null;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function generateThumbnail(
  openAiApiKey: string,
  prompt: string,
): Promise<{ bytes: Uint8Array; model: string; prompt: string }> {
  const finalPrompt = `${THUMBNAIL_STYLE_BASELINE}\n\nCreative brief:\n${prompt}`;
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt: finalPrompt,
      size: "1536x1024",
    }),
  });

  if (!response.ok) {
    throw new Error(`Thumbnail generation failed: ${await response.text()}`);
  }

  const json = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
  const first = json.data?.[0];
  if (!first) throw new Error("Thumbnail generation returned empty image payload");

  let bytes: Uint8Array | null = null;
  if (first.b64_json) {
    bytes = base64ToBytes(first.b64_json);
  } else if (first.url) {
    const imageResponse = await fetch(first.url);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch generated image: ${imageResponse.status}`);
    }
    bytes = new Uint8Array(await imageResponse.arrayBuffer());
  }

  if (!bytes) throw new Error("Thumbnail generation did not include b64_json or url");

  return {
    bytes,
    model: OPENAI_IMAGE_MODEL,
    prompt: finalPrompt,
  };
}

async function loadExternalInsights(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  videoId: string,
): Promise<ExternalInsightRow[]> {
  const { data } = await adminClient
    .from("external_insights")
    .select("id, source, insight_type, insights, raw_summary, created_at")
    .eq("user_id", userId)
    .or(`video_id.eq.${videoId},video_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(12);

  return ((data || []) as unknown[]).map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: String(row.id),
      source: String(row.source || "external"),
      insight_type: String(row.insight_type || "external"),
      insights: Array.isArray(row.insights) ? (row.insights as Array<Record<string, unknown>>) : [],
      raw_summary: (row.raw_summary as string | null) ?? null,
      created_at: String(row.created_at ?? new Date(0).toISOString()),
    };
  });
}

async function loadApprovedBaseline(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  videoId: string,
): Promise<string> {
  const { data: approved } = await adminClient
    .from("approved_outputs")
    .select("run_id, version, created_at")
    .eq("user_id", userId)
    .eq("video_id", videoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!approved?.run_id) return "No prior approved output baseline.";

  const { data: artifacts } = await adminClient
    .from("artifacts")
    .select("type, content")
    .eq("run_id", approved.run_id)
    .eq("approval_status", "approved");

  const summary = (artifacts || [])
    .map((item) => `${item.type}: ${(item.content || "").replace(/\s+/g, " ").slice(0, 180)}`)
    .join("\n");

  if (!summary) return "No prior approved output baseline.";
  return `Latest approved output baseline (v${approved.version}):\n${summary}`;
}

async function callAgent(
  openAiApiKey: string,
  agent: AgentDefinition,
  context: RunContext,
): Promise<AgentOutput> {
  const compiled = context.memoryByAgent[agent.name];

  const taskSection = agent.name === "TitleAgent"
    ? context.isPro
      ? "Return JSON exactly: {\"title\":\"...\",\"thumbnail_brief\":\"...\",\"image_prompt\":\"...\"}."
      : "Return JSON exactly: {\"title\":\"...\",\"thumbnail_brief\":\"...\"}."
    : "Return JSON exactly: {\"content\":\"...\"}.";

  const userPrompt = [
    `Video Title: ${context.title}`,
    `Video Description: ${context.description ?? "(none)"}`,
    context.channelBaselineText,
    compiled.constraintsText,
    `TASK\nGenerate ${agent.artifactType} output for this video.`,
    `QUALITY CHECKLIST\n${agent.qualityChecklist.map((line) => `- ${line}`).join("\n")}`,
    taskSection,
  ].join("\n\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.65,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${agent.systemPrompt} You are part of a 4+1 orchestrated agent system with strict output contracts.`,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${agent.name} OpenAI error: ${text}`);
  }

  const json = await response.json();
  const rawContent = json?.choices?.[0]?.message?.content;
  if (!rawContent || typeof rawContent !== "string") {
    throw new Error(`${agent.name} missing JSON content`);
  }

  const parsed = JSON.parse(rawContent) as Record<string, unknown>;
  const content = agent.name === "TitleAgent"
    ? formatTitleAgentContent(parsed, context.isPro)
    : typeof parsed.content === "string"
    ? parsed.content.trim()
    : "";

  if (!content) {
    throw new Error(`${agent.name} returned empty content`);
  }

  return {
    content,
    promptTokens: Number(json?.usage?.prompt_tokens ?? 0),
    completionTokens: Number(json?.usage?.completion_tokens ?? 0),
    totalTokens: Number(json?.usage?.total_tokens ?? 0),
    promptText: userPrompt,
    rawJson: parsed,
  };
}

async function upsertMemory(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  videoId: string,
  key: string,
  value: Record<string, unknown>,
  source: string,
) {
  const { data: existing } = await adminClient
    .from("agent_memory")
    .select("id")
    .eq("user_id", userId)
    .eq("video_id", videoId)
    .eq("key", key)
    .is("agent_name", null)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await adminClient
      .from("agent_memory")
      .update({ value, source, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return;
  }

  await adminClient.from("agent_memory").insert({
    user_id: userId,
    video_id: videoId,
    key,
    value,
    source,
    agent_name: null,
    priority: 1,
  });
}

function countWords(content: string): number {
  const normalized = content.trim();
  if (!normalized) return 0;
  return normalized.split(/\s+/).filter(Boolean).length;
}

function computeQualityDelta(
  artifacts: Array<{ type: string; content: string }>,
  previousScore: number | null,
): Record<string, unknown> {
  const hook = artifacts.find((item) => item.type === "hook")?.content ?? "";
  const script = artifacts.find((item) => item.type === "script")?.content ?? "";

  const hookWords = countWords(hook);
  const scriptWords = countWords(script);

  const hookWithinLimit = hookWords > 0 && hookWords <= 16;
  const scriptWithinRange = scriptWords >= 80 && scriptWords <= 220;

  const bannedPhrases = ["smash that like", "don\u2019t forget to like and subscribe", "click the link in bio"];
  const lowerScript = script.toLowerCase();
  const bannedPhraseHits = bannedPhrases.reduce((sum, phrase) => {
    if (!lowerScript.includes(phrase)) return sum;
    return sum + 1;
  }, 0);

  let score = 0;
  if (hookWithinLimit) score += 35;
  if (scriptWithinRange) score += 35;
  score += Math.max(0, 30 - bannedPhraseHits * 10);

  return {
    previous_score: previousScore,
    current_score: score,
    delta_score: previousScore === null ? null : score - previousScore,
    checks: {
      hook_words: hookWords,
      hook_within_limit: hookWithinLimit,
      script_words: scriptWords,
      script_within_range: scriptWithinRange,
      banned_phrase_hits: bannedPhraseHits,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openAiApiKey = Deno.env.get("OPENAI_API_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !openAiApiKey) {
    return jsonResponse(500, { error: "Missing required environment variables" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "Missing authorization header" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  const body = await req.json().catch(() => null) as { videoId?: string } | null;
  const videoId = body?.videoId?.trim();

  if (!videoId) {
    return jsonResponse(400, { error: "videoId is required" });
  }

  const [{ data: video, error: videoError }, { data: profile }] = await Promise.all([
    userClient
      .from("videos")
      .select("id, title, description")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single(),
    userClient.from("profiles").select("stripe_price_id").eq("user_id", user.id).maybeSingle(),
  ]);

  if (videoError || !video) {
    return jsonResponse(404, { error: "Video not found" });
  }

  const proPriceId = Deno.env.get("STRIPE_PRO_PRICE_ID") ?? "";
  const isPro = Boolean(proPriceId && profile?.stripe_price_id && profile.stripe_price_id === proPriceId);

  let runId: string | null = null;
  const trace = buildTrace();
  const metrics: AgentExecutionMetrics[] = [];
  const spanRecords: SpanRecord[] = [];

  const rootSpanId = randomHex(8);
  const rootStart = nowNano();

  let compiledMemoryMap: Record<AgentName, CompiledMemory> | null = null;
  let channelBaseline: ChannelBaseline | null = null;
  let externalInsights: ExternalInsightRow[] = [];
  let approvedBaselineText = "No prior approved output baseline.";
  let collectorStatus: ExportResult = { status: "skipped", error: null };

  try {
    const { data: run, error: runInsertError } = await adminClient
      .from("runs")
      .insert({
        video_id: video.id,
        user_id: user.id,
        status: "running",
        trace_id: trace.traceId,
        trace_url: trace.traceUrl,
        model: OPENAI_MODEL,
      })
      .select("id")
      .single();

    if (runInsertError || !run) {
      throw new Error(runInsertError?.message ?? "Failed to create run");
    }

    runId = run.id;

    [compiledMemoryMap, channelBaseline, externalInsights, approvedBaselineText] = await Promise.all([
      loadCompiledMemory(adminClient, user.id, video.id),
      loadChannelBaseline(adminClient, user.id),
      loadExternalInsights(adminClient, user.id, video.id),
      loadApprovedBaseline(adminClient, user.id, video.id),
    ]);

    const externalInsightText = externalInsights.length > 0
      ? externalInsights
        .slice(0, 8)
        .map((row) => {
          const top = row.insights?.[0] as Record<string, unknown> | undefined;
          const key = typeof top?.key === "string" ? top.key : row.insight_type;
          const value = typeof top?.value === "string" ? top.value : row.raw_summary ?? "n/a";
          return `${row.source}/${row.insight_type}: ${key} -> ${value}`;
        })
        .join("\n")
      : "No external insights.";

    const memoryApplied = AGENTS.map((agent) => ({
      agent: agent.name,
      memory_rows: compiledMemoryMap?.[agent.name].appliedMemoryRows ?? [],
      feedback_rows: compiledMemoryMap?.[agent.name].appliedFeedbackRows ?? [],
      channel_baseline: channelBaseline?.applied ?? {},
      external_insight_ids: externalInsights.map((insight) => insight.id),
      approved_output_baseline: approvedBaselineText,
    }));

    const context: RunContext = {
      userId: user.id,
      runId,
      videoId: video.id,
      title: video.title,
      description: video.description,
      isPro,
      memoryByAgent: compiledMemoryMap,
      channelBaselineText: `${channelBaseline.text}\n\nEXTERNAL INSIGHTS\n${externalInsightText}\n\nAPPROVED BASELINE\n${approvedBaselineText}`,
    };

    const artifactRows: Array<{
      run_id: string;
      user_id: string;
      type: string;
      content: string;
      agent_name: string;
      agent_version: string;
      storage_path?: string | null;
      mime_type?: string | null;
      metadata?: Record<string, unknown>;
    }> = [];
    let titleImagePrompt: string | null = null;

    const agentResults = await Promise.allSettled(
      AGENTS.map(async (agent) => {
        const spanId = randomHex(8);
        const spanStart = nowNano();
        const perfStart = Date.now();

        try {
          const result = await callAgent(openAiApiKey, agent, context);
          const costUsd = estimateCostUsd(OPENAI_MODEL, result.promptTokens, result.completionTokens);
          const latencyMs = Date.now() - perfStart;

          const artifactRow = {
            run_id: runId,
            user_id: user.id,
            type: agent.artifactType,
            content: result.content,
            agent_name: agent.name,
            agent_version: AGENT_VERSION,
            storage_path: null,
            mime_type: null,
            metadata: {},
          };

          const metric: AgentExecutionMetrics = {
            agent_name: agent.name,
            artifact_type: agent.artifactType,
            latency_ms: latencyMs,
            prompt_tokens: result.promptTokens,
            completion_tokens: result.completionTokens,
            total_tokens: result.totalTokens,
            cost_usd: costUsd,
            status: "completed",
            error_message: null,
            prompt_text: result.promptText,
          };

          const span: SpanRecord = {
            spanId,
            parentSpanId: rootSpanId,
            name: `${agent.name}.generate`,
            startTimeUnixNano: spanStart,
            endTimeUnixNano: nowNano(),
            statusCode: 1,
            attributes: [
              spanAttrString("llm.vendor", "openai"),
              spanAttrString("llm.model", OPENAI_MODEL),
              spanAttrString("studio.agent_name", agent.name),
              spanAttrString("studio.artifact_type", agent.artifactType),
              spanAttrInt("llm.tokens.input", result.promptTokens),
              spanAttrInt("llm.tokens.output", result.completionTokens),
              spanAttrInt("llm.tokens.total", result.totalTokens),
              spanAttrDouble("llm.cost", costUsd),
              spanAttrInt("studio.latency_ms", latencyMs),
            ],
          };

          return {
            ok: true as const,
            agent,
            artifactRow,
            metric,
            span,
            titleImagePrompt: agent.name === "TitleAgent" ? extractTitleImagePrompt(result.rawJson) : null,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown agent error";
          const latencyMs = Date.now() - perfStart;
          const metric: AgentExecutionMetrics = {
            agent_name: agent.name,
            artifact_type: agent.artifactType,
            latency_ms: latencyMs,
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
            cost_usd: 0,
            status: "failed",
            error_message: message,
            prompt_text: context.channelBaselineText,
          };

          const span: SpanRecord = {
            spanId,
            parentSpanId: rootSpanId,
            name: `${agent.name}.generate`,
            startTimeUnixNano: spanStart,
            endTimeUnixNano: nowNano(),
            statusCode: 2,
            statusMessage: message,
            attributes: [
              spanAttrString("studio.agent_name", agent.name),
              spanAttrString("studio.artifact_type", agent.artifactType),
              spanAttrInt("studio.latency_ms", latencyMs),
              spanAttrString("error.message", message),
            ],
          };

          return { ok: false as const, agent, metric, span, message };
        }
      }),
    );

    let firstFailure: string | null = null;
    for (const settled of agentResults) {
      if (settled.status !== "fulfilled") {
        firstFailure = settled.reason instanceof Error ? settled.reason.message : "Unknown agent failure";
        continue;
      }
      const item = settled.value;
      metrics.push(item.metric);
      spanRecords.push(item.span);
      if (item.ok) {
        artifactRows.push(item.artifactRow);
        if (item.titleImagePrompt) titleImagePrompt = item.titleImagePrompt;
      } else if (!firstFailure) {
        firstFailure = `${item.agent.name} failed: ${item.message}`;
      }
    }

    if (firstFailure) {
      throw new Error(firstFailure);
    }

    if (isPro && titleImagePrompt) {
      const thumbSpanId = randomHex(8);
      const thumbSpanStart = nowNano();
      const thumbPerfStart = Date.now();
      try {
        const thumbnail = await generateThumbnail(openAiApiKey, titleImagePrompt);
        const storagePath = `${user.id}/${runId}/thumbnail.png`;
        const upload = await adminClient.storage.from("thumbnails").upload(storagePath, thumbnail.bytes, {
          contentType: "image/png",
          upsert: true,
        });

        if (upload.error) {
          throw new Error(upload.error.message);
        }

        artifactRows.push({
          run_id: runId,
          user_id: user.id,
          type: "thumbnail",
          content: "Generated thumbnail image",
          agent_name: "TitleAgent",
          agent_version: AGENT_VERSION,
          storage_path: storagePath,
          mime_type: "image/png",
          metadata: {
            prompt: thumbnail.prompt,
            model: thumbnail.model,
            size: "1024x1024",
          },
        });

        metrics.push({
          agent_name: "TitleAgent",
          artifact_type: "thumbnail",
          latency_ms: Date.now() - thumbPerfStart,
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          cost_usd: 0,
          status: "completed",
          error_message: null,
          prompt_text: `THUMBNAIL_PROMPT\n${titleImagePrompt}`,
        });

        spanRecords.push({
          spanId: thumbSpanId,
          parentSpanId: rootSpanId,
          name: "TitleAgent.thumbnail",
          startTimeUnixNano: thumbSpanStart,
          endTimeUnixNano: nowNano(),
          statusCode: 1,
          attributes: [
            spanAttrString("studio.agent_name", "TitleAgent"),
            spanAttrString("studio.artifact_type", "thumbnail"),
            spanAttrString("llm.model", thumbnail.model),
            spanAttrInt("studio.latency_ms", Date.now() - thumbPerfStart),
          ],
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Thumbnail generation failed";
        metrics.push({
          agent_name: "TitleAgent",
          artifact_type: "thumbnail",
          latency_ms: Date.now() - thumbPerfStart,
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          cost_usd: 0,
          status: "failed",
          error_message: message,
          prompt_text: `THUMBNAIL_PROMPT\n${titleImagePrompt}`,
        });

        spanRecords.push({
          spanId: thumbSpanId,
          parentSpanId: rootSpanId,
          name: "TitleAgent.thumbnail",
          startTimeUnixNano: thumbSpanStart,
          endTimeUnixNano: nowNano(),
          statusCode: 2,
          statusMessage: message,
          attributes: [
            spanAttrString("studio.agent_name", "TitleAgent"),
            spanAttrString("studio.artifact_type", "thumbnail"),
            spanAttrString("error.message", message),
          ],
        });
      }
    }

    const { error: artifactError } = await adminClient.from("artifacts").insert(artifactRows);
    if (artifactError) {
      throw new Error(`Artifact insert failed: ${artifactError.message}`);
    }

    const totalTokens = metrics.reduce((sum, item) => sum + item.total_tokens, 0);
    const totalCostUsd = Number(metrics.reduce((sum, item) => sum + item.cost_usd, 0).toFixed(4));

    const { data: previousRun } = await adminClient
      .from("runs")
      .select("quality_delta")
      .eq("user_id", user.id)
      .eq("video_id", video.id)
      .not("quality_delta", "is", null)
      .neq("id", runId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousScore = typeof previousRun?.quality_delta === "object" && previousRun.quality_delta !== null
      ? Number((previousRun.quality_delta as Record<string, unknown>).current_score ?? NaN)
      : null;

    const qualityDelta = computeQualityDelta(
      artifactRows.map((row) => ({ type: row.type, content: row.content })),
      Number.isFinite(previousScore) ? previousScore : null,
    );

    await upsertMemory(
      adminClient,
      user.id,
      video.id,
      "last_success_summary",
      {
        title: video.title,
        generated_agents: AGENTS.map((agent) => agent.name),
        generated_at: new Date().toISOString(),
        quality_score: qualityDelta.current_score,
      },
      "run_summary",
    );

    const appliedMemoryIds = Array.from(
      new Set(
        AGENTS.flatMap((agent) => [
          ...(compiledMemoryMap?.[agent.name].appliedMemoryRows.map((row) => row.id) ?? []),
        ]),
      ),
    );

    if (appliedMemoryIds.length > 0) {
      await adminClient
        .from("agent_memory")
        .update({ last_applied_at: new Date().toISOString() })
        .in("id", appliedMemoryIds);
    }

    if (externalInsights.length > 0) {
      await adminClient
        .from("external_insights")
        .update({ applied_to_memory: true })
        .in("id", externalInsights.map((item) => item.id));
    }

    spanRecords.push({
      spanId: rootSpanId,
      name: "content_generation_pipeline",
      startTimeUnixNano: rootStart,
      endTimeUnixNano: nowNano(),
      statusCode: 1,
      attributes: [
        spanAttrString("studio.run_id", runId),
        spanAttrString("studio.video_id", video.id),
        spanAttrString("studio.user_id", user.id),
        spanAttrString("llm.model", OPENAI_MODEL),
        spanAttrInt("llm.tokens.total", totalTokens),
        spanAttrDouble("llm.cost", totalCostUsd),
        spanAttrInt("studio.agent_count", AGENTS.length),
      ],
    });

    collectorStatus = await exportTrace(trace.traceId, spanRecords, runId);

    const { error: runUpdateError } = await adminClient
      .from("runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        cost_tokens: totalTokens,
        cost_usd: totalCostUsd,
        model: OPENAI_MODEL,
        trace_id: trace.traceId,
        trace_url: trace.traceUrl,
        error_message: null,
        agent_metrics: metrics,
        memory_applied: memoryApplied,
        quality_delta: qualityDelta,
        collector_export_status: collectorStatus.status,
        collector_export_error: collectorStatus.error,
      })
      .eq("id", runId);

    if (runUpdateError) {
      throw new Error(`Run update failed: ${runUpdateError.message}`);
    }

    return jsonResponse(200, {
      runId,
      traceUrl: trace.traceUrl,
      costUsd: totalCostUsd,
      costTokens: totalTokens,
      agentCount: AGENTS.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (runId) {
      spanRecords.push({
        spanId: rootSpanId,
        name: "content_generation_pipeline",
        startTimeUnixNano: rootStart,
        endTimeUnixNano: nowNano(),
        statusCode: 2,
        statusMessage: message,
        attributes: [
          spanAttrString("studio.run_id", runId),
          spanAttrString("studio.video_id", video.id),
          spanAttrString("studio.user_id", user.id),
          spanAttrString("llm.model", OPENAI_MODEL),
          spanAttrString("error.message", message),
          spanAttrInt("studio.failed_agent_count", metrics.filter((metric) => metric.status === "failed").length),
        ],
      });

      collectorStatus = await exportTrace(trace.traceId, spanRecords, runId);

      await adminClient
        .from("runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: message,
          trace_id: trace.traceId,
          trace_url: trace.traceUrl,
          model: OPENAI_MODEL,
          agent_metrics: metrics,
          memory_applied: compiledMemoryMap
            ? AGENTS.map((agent) => ({
              agent: agent.name,
              memory_rows: compiledMemoryMap?.[agent.name].appliedMemoryRows ?? [],
              feedback_rows: compiledMemoryMap?.[agent.name].appliedFeedbackRows ?? [],
              channel_baseline: channelBaseline?.applied ?? {},
              external_insight_ids: externalInsights.map((insight) => insight.id),
              approved_output_baseline: approvedBaselineText,
            }))
            : null,
          collector_export_status: collectorStatus.status,
          collector_export_error: collectorStatus.error,
        })
        .eq("id", runId);
    }

    return jsonResponse(500, {
      error: message,
      runId,
      traceUrl: trace.traceUrl,
      failedAgent: metrics.find((metric) => metric.status === "failed")?.agent_name ?? null,
    });
  }
});
