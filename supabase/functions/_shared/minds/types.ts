export interface CreatorDNA {
  niche: string;
  audience: string;
  tone: string;
  goal: string;
  preferred_formats: string[];
  avoid: string[];
  primary_platform: string;
}

export interface CreatorGoal {
  id?: string;
  goal_type: string;
  target_metric: string;
  current_value: number;
  status: string;
  priority: string;
}

export interface MindMessagePayload {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface MindResponse {
  id: string;
  response: string;
  status: string;
}
