import { createMindsClient } from "npm:@animocabrands/minds-client-lib";

export function getMindsClient() {
  const builderApiKey = Deno.env.get("MINDS_BUILDER_API_KEY");
  
  if (!builderApiKey) {
    throw new Error("MINDS_BUILDER_API_KEY is not set in the environment.");
  }

  return createMindsClient({ builderApiKey });
}

export function getMindId() {
  const mindId = Deno.env.get("MINDS_MIND_ID");
  if (!mindId) {
    throw new Error("MINDS_MIND_ID is not set in the environment.");
  }
  return mindId;
}
