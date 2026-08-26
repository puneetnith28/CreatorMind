#!/usr/bin/env node

/**
 * OpenClaw Worker (safe local runner)
 * - Polls pending jobs from Supabase Edge function
 * - Produces lightweight insights (rule-based by default)
 * - Pushes insights/results back to Supabase
 *
 * Safety defaults:
 * - No OpenAI usage unless OPENCLAW_USE_OPENAI=true
 * - Bounded jobs per cycle
 * - Request timeout
 * - Dry-run mode supported
 */

const argv = new Set(process.argv.slice(2));
const ONCE = argv.has("--once");
const DRY_RUN = argv.has("--dry-run");

const REQUIRED_ENV = ["SUPABASE_URL", "OPENCLAW_SERVICE_TOKEN"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[openclaw] Missing required env: ${key}`);
    process.exit(1);
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const OPENCLAW_SERVICE_TOKEN = process.env.OPENCLAW_SERVICE_TOKEN;
const WORKER_ID = process.env.OPENCLAW_WORKER_ID || `openclaw-${process.platform}-${process.pid}`;
const POLL_INTERVAL_MS = Number(process.env.OPENCLAW_POLL_INTERVAL_MS || 60 * 60 * 1000);
const MAX_JOBS_PER_CYCLE = Math.min(10, Math.max(1, Number(process.env.OPENCLAW_MAX_JOBS_PER_CYCLE || 3)));
const REQUEST_TIMEOUT_MS = Math.min(60_000, Math.max(5_000, Number(process.env.OPENCLAW_REQUEST_TIMEOUT_MS || 20_000)));
const ENQUEUE_ENABLED = process.env.OPENCLAW_ENQUEUE_ENABLED !== "false";
const DAILY_REFRESH_HOUR_UTC = Number(process.env.OPENCLAW_DAILY_REFRESH_HOUR_UTC || 0);

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";
const USE_OPENAI = process.env.OPENCLAW_USE_OPENAI === "true";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

let lastDailyRefreshKey = "";

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function edgeHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "x-openclaw-token": OPENCLAW_SERVICE_TOKEN,
    "x-worker-id": WORKER_ID,
    ...extra,
  };
}

async function callEdge(path, { method = "POST", body, headers = {} } = {}) {
  const url = `${SUPABASE_URL}/functions/v1/${path}`;
  const response = await fetchWithTimeout(url, {
    method,
    headers: edgeHeaders(headers),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${json?.error || text || "unknown error"}`);
  }
  return json;
}

function summarizeCommentSignals(comments) {
  if (!Array.isArray(comments) || comments.length === 0) {
    return "Low comment signal; prompt clearer audience interaction.";
  }
  const joined = comments.join(" ").toLowerCase();
  if (joined.includes("too long") || joined.includes("long")) return "Audience flags pacing/length; tighten scripts and remove filler.";
  if (joined.includes("love") || joined.includes("great")) return "Positive sentiment around current angle; keep packaging style consistent.";
  return "Mixed comment signal; keep stronger hook and clearer payoff in first seconds.";
}

async function maybeAnalyzeWithOpenAI(context) {
  if (!USE_OPENAI) return null;
  if (!OPENAI_API_KEY) return null;

  const prompt = [
    "You are a lightweight content performance analyst.",
    "Return strict JSON with keys: insights (array of {key,value,priority,appliesGlobally}), rawSummary, score.",
    `Context: ${JSON.stringify(context)}`,
  ].join("\n");

  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return only valid JSON." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) return null;
  const json = await response.json();
  const raw = json?.choices?.[0]?.message?.content;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function fetchYouTubeVideoSignals(youtubeVideoId) {
  if (!YOUTUBE_API_KEY || !youtubeVideoId) return null;

  const detailsResp = await fetchWithTimeout(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${encodeURIComponent(youtubeVideoId)}&key=${encodeURIComponent(YOUTUBE_API_KEY)}`,
  );
  if (!detailsResp.ok) return null;
  const detailsJson = await detailsResp.json();
  const video = detailsJson?.items?.[0];
  if (!video) return null;

  const commentsResp = await fetchWithTimeout(
    `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${encodeURIComponent(youtubeVideoId)}&maxResults=5&order=relevance&textFormat=plainText&key=${encodeURIComponent(YOUTUBE_API_KEY)}`,
  );

  let topComments = [];
  if (commentsResp.ok) {
    const commentsJson = await commentsResp.json();
    topComments = (commentsJson?.items || [])
      .map((item) => item?.snippet?.topLevelComment?.snippet?.textDisplay)
      .filter(Boolean)
      .slice(0, 5);
  }

  return {
    title: video?.snippet?.title || "",
    views: Number(video?.statistics?.viewCount || 0),
    likes: Number(video?.statistics?.likeCount || 0),
    comments: Number(video?.statistics?.commentCount || 0),
    topComments,
  };
}

function ruleBasedInsights(job, videoSignals) {
  const payload = job.payload || {};
  const insights = [];

  if (videoSignals) {
    const ratio = videoSignals.views > 0 ? (videoSignals.likes / videoSignals.views) * 100 : 0;
    insights.push({
      key: "high_retention_pattern",
      value: videoSignals.views > 1000
        ? `Recent topic (${videoSignals.title}) is pulling strong views; keep similar framing and payoff-first structure.`
        : `Improve first 2 seconds for topic (${videoSignals.title}); current view velocity is modest.`,
      priority: 2,
      appliesGlobally: true,
    });
    insights.push({
      key: "audience_prefers",
      value: ratio > 4
        ? `Audience responds well to this packaging (like ratio ${ratio.toFixed(2)}%).`
        : `Increase specificity and emotional clarity in hook to improve engagement (like ratio ${ratio.toFixed(2)}%).`,
      priority: 2,
      appliesGlobally: true,
    });
    insights.push({
      key: "avoid_patterns",
      value: summarizeCommentSignals(videoSignals.topComments),
      priority: 1,
      appliesGlobally: true,
    });
  } else {
    insights.push({
      key: "audience_prefers",
      value: "Lead with concrete payoff in the first line and keep visual promise explicit.",
      priority: 1,
      appliesGlobally: true,
    });
    insights.push({
      key: "avoid_patterns",
      value: "Avoid vague intros and overloaded scenes in thumbnails.",
      priority: 1,
      appliesGlobally: true,
    });
  }

  if (job.job_type === "inspiration_refresh" && payload.youtube_url) {
    insights.push({
      key: "high_retention_pattern",
      value: `Refresh inspiration from ${payload.youtube_url}: emulate pacing and packaging, not verbatim structure.`,
      priority: 2,
      appliesGlobally: true,
    });
  }

  return insights;
}

async function processJob(job) {
  const payload = job.payload || {};
  const youtubeVideoId = payload.youtube_video_id || null;
  const youtubeSignals = await fetchYouTubeVideoSignals(youtubeVideoId);

  const ruleInsights = ruleBasedInsights(job, youtubeSignals);
  const llmAnalysis = await maybeAnalyzeWithOpenAI({
    jobType: job.job_type,
    payload,
    youtubeSignals,
  });

  const insights = Array.isArray(llmAnalysis?.insights) && llmAnalysis.insights.length > 0
    ? llmAnalysis.insights
    : ruleInsights;

  const rawSummary = typeof llmAnalysis?.rawSummary === "string"
    ? llmAnalysis.rawSummary
    : youtubeSignals
    ? `Analyzed video ${youtubeSignals.title} at ${nowIso()} with ${youtubeSignals.views} views.`
    : `Processed ${job.job_type} job at ${nowIso()} with rule-based analysis.`;

  const score = Number(llmAnalysis?.score ?? (youtubeSignals?.views || 0));

  return {
    source: job.source || "openclaw",
    insightType: job.job_type === "inspiration_refresh" ? "inspiration_pattern" : "youtube_performance",
    rawSummary,
    score,
    insights,
  };
}

async function pushJobResult({ job, status, result, errorMessage }) {
  const body = {
    jobId: job.id,
    userId: job.user_id,
    videoId: job.video_id,
    source: result?.source || job.source || "openclaw",
    insightType: result?.insightType || "youtube_performance",
    rawSummary: result?.rawSummary || null,
    insights: result?.insights || [],
    score: Number(result?.score || 0),
    status,
    errorMessage: errorMessage || undefined,
  };

  if (DRY_RUN) {
    console.log(`[openclaw] DRY_RUN push ${status} for job ${job.id}`, JSON.stringify(body));
    return;
  }

  await callEdge("openclaw-push-insights", { body });
}

async function runCycle() {
  console.log(`[openclaw] cycle start ${nowIso()} worker=${WORKER_ID}`);

  if (ENQUEUE_ENABLED && !DRY_RUN) {
    try {
      await callEdge("enqueue-hourly-analysis", { body: {} });
      const now = new Date();
      const dayKey = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
      if (now.getUTCHours() === DAILY_REFRESH_HOUR_UTC && dayKey !== lastDailyRefreshKey) {
        await callEdge("enqueue-inspiration-refresh", { body: {} });
        lastDailyRefreshKey = dayKey;
      }
    } catch (error) {
      console.warn(`[openclaw] enqueue warning: ${error.message}`);
    }
  }

  let pulled = { jobs: [] };
  if (DRY_RUN) {
    pulled = { jobs: [] };
  } else {
    pulled = await callEdge(`openclaw-pull-jobs?limit=${MAX_JOBS_PER_CYCLE}`, { method: "GET" });
  }

  const jobs = Array.isArray(pulled.jobs) ? pulled.jobs : [];
  console.log(`[openclaw] pulled ${jobs.length} job(s)`);

  for (const job of jobs) {
    try {
      const result = await processJob(job);
      await pushJobResult({ job, status: "completed", result });
      console.log(`[openclaw] completed job ${job.id} (${job.job_type})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      try {
        await pushJobResult({ job, status: "failed", errorMessage: message });
      } catch (pushError) {
        console.error(`[openclaw] failed to push failed status for job ${job.id}:`, pushError);
      }
      console.error(`[openclaw] job ${job.id} failed: ${message}`);
    }
  }

  console.log(`[openclaw] cycle complete ${nowIso()}`);
}

async function main() {
  if (ONCE) {
    await runCycle();
    return;
  }

  // Start immediately, then poll hourly by default.
  while (true) {
    await runCycle();
    await sleep(POLL_INTERVAL_MS);
  }
}

main().catch((error) => {
  console.error("[openclaw] fatal:", error);
  process.exit(1);
});
