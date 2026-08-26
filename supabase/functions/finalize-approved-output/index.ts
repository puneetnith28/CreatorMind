import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type ArtifactRow = {
  id: string;
  type: string;
  content: string | null;
  approval_status: string;
  approved_at: string | null;
  created_at: string;
  storage_path: string | null;
  mime_type: string | null;
  metadata: Record<string, unknown> | null;
  agent_name: string | null;
};

function escapePdfText(value: string): string {
  const normalized = value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\x7E]/g, "");
  return normalized.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function generateSimplePdf(lines: string[]): Uint8Array {
  const contentLines = lines.slice(0, 44);
  const textOps = ["BT", "/F1 11 Tf", "40 790 Td", "14 TL"];
  contentLines.forEach((line, index) => {
    if (index === 0) textOps.push(`(${escapePdfText(line)}) Tj`);
    else textOps.push(`T* (${escapePdfText(line)}) Tj`);
  });
  textOps.push("ET");
  const stream = textOps.join("\n");

  const objs = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];

  const header = "%PDF-1.4\n";
  let body = "";
  const offsets: number[] = [0];

  for (const obj of objs) {
    offsets.push((header + body).length);
    body += obj;
  }

  const xrefStart = (header + body).length;
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new TextEncoder().encode(header + body + xref + trailer);
}

function jsonText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse(500, { error: "Missing required environment variables" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse(401, { error: "Missing authorization header" });

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return jsonResponse(401, { error: "Unauthorized" });

  const body = (await req.json().catch(() => null)) as { runId?: string } | null;
  const runId = body?.runId?.trim();
  if (!runId) return jsonResponse(400, { error: "runId is required" });

  const { data: run, error: runError } = await userClient
    .from("runs")
    .select("id, video_id, status, started_at, completed_at, memory_applied, quality_delta")
    .eq("id", runId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (runError || !run) return jsonResponse(404, { error: "Run not found" });

  const [{ data: video }, { data: artifacts, error: artifactError }] = await Promise.all([
    userClient.from("videos").select("id, title, description").eq("id", run.video_id).eq("user_id", user.id).maybeSingle(),
    userClient.from("artifacts").select("*").eq("run_id", run.id).eq("user_id", user.id).order("created_at", { ascending: true }),
  ]);

  if (artifactError) return jsonResponse(500, { error: artifactError.message });

  const rows = (artifacts || []) as ArtifactRow[];
  const required = ["hook", "script", "title", "strategy"];
  const approvedTypes = new Set(rows.filter((item) => item.approval_status === "approved").map((item) => item.type));
  const missing = required.filter((type) => !approvedTypes.has(type));
  if (missing.length > 0) {
    return jsonResponse(400, { error: `Missing approved artifacts: ${missing.join(", ")}` });
  }

  const { data: latest } = await adminClient
    .from("approved_outputs")
    .select("version")
    .eq("run_id", run.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = Number(latest?.version || 0) + 1;
  const basePath = `${user.id}/${run.video_id}/${run.id}/v${version}`;
  const jsonPath = `${basePath}/approved-output.json`;
  const pdfPath = `${basePath}/approved-output.pdf`;

  const payload = {
    exported_at: new Date().toISOString(),
    version,
    run,
    video,
    artifacts: rows.map((item) => ({
      id: item.id,
      type: item.type,
      approval_status: item.approval_status,
      approved_at: item.approved_at,
      content: item.content,
      storage_path: item.storage_path,
      mime_type: item.mime_type,
      metadata: item.metadata,
      agent_name: item.agent_name,
    })),
  };

  const jsonBytes = new TextEncoder().encode(jsonText(payload));

  const pdfLines: string[] = [
    `Studio Mind Approved Output v${version}`,
    `Video: ${video?.title ?? "Untitled"}`,
    `Run: ${run.id}`,
    `Exported: ${new Date().toISOString()}`,
    "",
  ];

  for (const artifact of rows.filter((item) => item.approval_status === "approved")) {
    pdfLines.push(`${artifact.type.toUpperCase()} (${artifact.agent_name ?? "agent"})`);
    const text = (artifact.content || "").replace(/\s+/g, " ").trim();
    const chunks = text.match(/.{1,100}(\s|$)/g) || [text.slice(0, 100)];
    chunks.slice(0, 5).forEach((chunk) => pdfLines.push(chunk.trim()));
    pdfLines.push("");
  }

  const pdfBytes = generateSimplePdf(pdfLines);

  const [jsonUpload, pdfUpload] = await Promise.all([
    adminClient.storage.from("approved-outputs").upload(jsonPath, jsonBytes, { contentType: "application/json", upsert: true }),
    adminClient.storage.from("approved-outputs").upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true }),
  ]);

  if (jsonUpload.error || pdfUpload.error) {
    return jsonResponse(500, { error: jsonUpload.error?.message || pdfUpload.error?.message || "Upload failed" });
  }

  const { error: insertError } = await adminClient.from("approved_outputs").insert({
    user_id: user.id,
    video_id: run.video_id,
    run_id: run.id,
    json_storage_path: jsonPath,
    pdf_storage_path: pdfPath,
    version,
  });

  if (insertError) return jsonResponse(500, { error: insertError.message });

  const [jsonSigned, pdfSigned] = await Promise.all([
    adminClient.storage.from("approved-outputs").createSignedUrl(jsonPath, 60 * 60),
    adminClient.storage.from("approved-outputs").createSignedUrl(pdfPath, 60 * 60),
  ]);

  return jsonResponse(200, {
    version,
    jsonPath,
    pdfPath,
    jsonUrl: jsonSigned.data?.signedUrl || null,
    pdfUrl: pdfSigned.data?.signedUrl || null,
  });
});
