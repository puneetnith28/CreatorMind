import { getMindsClient, getMindId } from "./client.ts";
import { CreatorDNA, CreatorGoal } from "./types.ts";

/**
 * Synchronizes the creator's DNA and goals into the Mind's long-term memory context.
 * We implement this by ensuring a dedicated 'context' conversation and injecting the DNA.
 */
export async function syncCreatorContext(dna: CreatorDNA, goals: CreatorGoal[]) {
  const client = getMindsClient();
  const mindId = getMindId();

  const conversation = await client.ensureConversation(mindId, { name: "CreatorMind DNA Context" });

  const contextMessage = `
[SYSTEM CONTEXT UPDATE]
Identity & Niche: ${dna.niche}
Target Audience: ${dna.audience}
Tone: ${dna.tone}
Avoid: ${dna.avoid.join(', ')}

Current Goals:
${goals.map(g => `- ${g.goal_type}: Target ${g.target_metric} (Current: ${g.current_value})`).join('\n')}

Please internalize this Creator DNA and use it to inform all future content, strategy, and advice.
  `.trim();

  await client.sendMessage(mindId, conversation.conversationId, { text: contextMessage });
  const reply = await client.waitForReply(mindId, conversation.conversationId);

  return {
    status: "success",
    reply: reply.text
  };
}
