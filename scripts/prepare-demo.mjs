import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function prepareDemoData() {
  console.log("🧹 Preparing Environment for the 14-Step Final Demo...\n");

  // Get the first user (assuming local/demo env has only 1 main user)
  const { data: users, error: userError } = await supabase.auth.admin.listUsers();
  if (userError || !users.users.length) {
    console.error("No users found. Please create an account in the app first.");
    process.exit(1);
  }
  const userId = users.users[0].id;
  console.log(`👤 Targeting User ID: ${userId}`);

  // 1. Clean up old noise (Opportunities, Experiments, Agent Memory, External Insights)
  console.log("\n🗑️ Clearing old demo data...");
  await supabase.from('opportunities').delete().eq('user_id', userId);
  await supabase.from('experiments').delete().eq('user_id', userId);
  await supabase.from('agent_memory').delete().eq('user_id', userId);
  await supabase.from('external_insights').delete().eq('user_id', userId);
  await supabase.from('creator_dna').delete().eq('user_id', userId);
  console.log("✅ Cleared old data.");

  // 2. Seed the precise Creator DNA for the demo
  console.log("\n🧬 Seeding Demo Creator DNA (Step 1)...");
  await supabase.from('creator_dna').insert({
    user_id: userId,
    niche: "AI and Programming",
    target_audience: "Students and Developers",
    content_tone: "Practical, educational, and hands-on",
    topics_to_avoid: "Clickbait, drama, superficial overviews"
  });
  console.log("✅ Seeded Creator DNA.");

  // 3. Seed the precise Audience Signal for the demo
  console.log("\n📡 Seeding Audience Signal (Step 4)...");
  await supabase.from('external_insights').insert({
    user_id: userId,
    platform: "youtube",
    insight_type: "audience_request",
    content: "Audience is repeatedly commenting and asking for a detailed tutorial on deploying AI agents to production.",
    metrics: { frequency: "high", urgency: "high" },
    source_url: "youtube.com/comments"
  });
  console.log("✅ Seeded Audience Signal: 'deploying AI agents'");

  console.log("\n🎉 Environment is perfectly prepped for the 14-Step Demo!");
  console.log("👉 Next steps for Demo:");
  console.log("1. Start the UI: npm run dev");
  console.log("2. Start the Worker: node scripts/agent-worker.mjs");
  console.log("3. Watch the autonomous worker detect the signal and create the opportunity!");
}

prepareDemoData().catch(console.error);
