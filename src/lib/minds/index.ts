import { supabase } from '../../integrations/supabase/client';
import { CreatorDNA, CreatorGoal } from '../../../supabase/functions/_shared/minds/types';

/**
 * The frontend uses Supabase Edge Functions to securely interact with the Minds SDK
 * to avoid exposing MINDS_BUILDER_API_KEY and MINDS_MIND_ID to the client.
 */

export async function triggerMindSync(dna: CreatorDNA, goals: CreatorGoal[]) {
  const { data, error } = await supabase.functions.invoke('sync-mind-context', {
    body: { dna, goals }
  });

  if (error) throw error;
  return data;
}

export async function triggerMindAction(actionPayload: any) {
  const { data, error } = await supabase.functions.invoke('run-mind-action', {
    body: { payload: actionPayload }
  });

  if (error) throw error;
  return data;
}
