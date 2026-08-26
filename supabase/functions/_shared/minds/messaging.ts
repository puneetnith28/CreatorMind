import { getMindsClient, getMindId } from "./client.ts";
import { MindMessagePayload } from "./types.ts";

/**
 * Sends a message or prompt payload to the Mind using the official SDK.
 */
export async function sendMessageToMind(payload: MindMessagePayload, conversationAlias = "default") {
  const client = getMindsClient();
  const mindId = getMindId();

  // Create or retrieve a conversation
  const conversation = await client.ensureConversation(mindId, { name: conversationAlias });

  // Send the message
  await client.sendMessage(mindId, conversation.conversationId, { text: payload.content });

  // Wait for and return the reply
  const reply = await client.waitForReply(mindId, conversation.conversationId);
  
  return {
    id: reply.id || Date.now().toString(),
    response: reply.text,
    status: "success"
  };
}
