export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      artifacts: {
        Row: {
          agent_name: string | null
          agent_version: string | null
          approval_status: string
          approved_at: string | null
          content: string | null
          created_at: string
          id: string
          metadata: Json
          mime_type: string | null
          run_id: string
          storage_path: string | null
          type: string
          user_id: string
        }
        Insert: {
          agent_name?: string | null
          agent_version?: string | null
          approval_status?: string
          approved_at?: string | null
          content?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          run_id: string
          storage_path?: string | null
          type: string
          user_id: string
        }
        Update: {
          agent_name?: string | null
          agent_version?: string | null
          approval_status?: string
          approved_at?: string | null
          content?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          run_id?: string
          storage_path?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifacts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_jobs: {
        Row: {
          attempt_count: number
          created_at: string
          id: string
          job_type: string
          last_error: string | null
          payload: Json
          run_after: string
          source: string
          status: string
          updated_at: string
          user_id: string
          video_id: string | null
          worker_id: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          id?: string
          job_type?: string
          last_error?: string | null
          payload?: Json
          run_after?: string
          source: string
          status?: string
          updated_at?: string
          user_id: string
          video_id?: string | null
          worker_id?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string
          id?: string
          job_type?: string
          last_error?: string | null
          payload?: Json
          run_after?: string
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
          video_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_jobs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memory: {
        Row: {
          agent_name: string | null
          id: string
          key: string
          last_applied_at: string | null
          priority: number
          source: string
          updated_at: string
          user_id: string
          value: Json
          video_id: string | null
        }
        Insert: {
          agent_name?: string | null
          id?: string
          key: string
          last_applied_at?: string | null
          priority?: number
          source: string
          updated_at?: string
          user_id: string
          value: Json
          video_id?: string | null
        }
        Update: {
          agent_name?: string | null
          id?: string
          key?: string
          last_applied_at?: string | null
          priority?: number
          source?: string
          updated_at?: string
          user_id?: string
          value?: Json
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_memory_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_modification_log: {
        Row: {
          agent_name: string | null
          change_summary: string
          created_at: string
          id: string
          metadata: Json
          run_id: string | null
          source: string
          user_id: string
          video_id: string | null
        }
        Insert: {
          agent_name?: string | null
          change_summary: string
          created_at?: string
          id?: string
          metadata?: Json
          run_id?: string | null
          source: string
          user_id: string
          video_id?: string | null
        }
        Update: {
          agent_name?: string | null
          change_summary?: string
          created_at?: string
          id?: string
          metadata?: Json
          run_id?: string | null
          source?: string
          user_id?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_modification_log_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_modification_log_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      approved_outputs: {
        Row: {
          created_at: string
          id: string
          json_storage_path: string
          pdf_storage_path: string
          run_id: string
          user_id: string
          version: number
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          json_storage_path: string
          pdf_storage_path: string
          run_id: string
          user_id: string
          version?: number
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          json_storage_path?: string
          pdf_storage_path?: string
          run_id?: string
          user_id?: string
          version?: number
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approved_outputs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approved_outputs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_inspirations: {
        Row: {
          created_at: string
          id: string
          label: string | null
          note: string | null
          user_id: string
          youtube_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          note?: string | null
          user_id: string
          youtube_url: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          note?: string | null
          user_id?: string
          youtube_url?: string
        }
        Relationships: []
      }
      channel_preferences: {
        Row: {
          banned_phrases: string[]
          cta_style: string | null
          hook_style: string
          id: string
          notes: string | null
          pacing: string
          script_length_preference: string
          tone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          banned_phrases?: string[]
          cta_style?: string | null
          hook_style?: string
          id?: string
          notes?: string | null
          pacing?: string
          script_length_preference?: string
          tone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          banned_phrases?: string[]
          cta_style?: string | null
          hook_style?: string
          id?: string
          notes?: string | null
          pacing?: string
          script_length_preference?: string
          tone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          channel_style_goal: string | null
          channel_summary_prompt: string | null
          created_at: string
          id: string
          name: string | null
          onboarding_completed_at: string | null
          stripe_connect_account_id: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          subscription_current_period_end: string | null
          subscription_status: string | null
          updated_at: string
          user_id: string
          youtube_access_token_enc: string | null
          youtube_channel_id: string | null
          youtube_connected_at: string | null
          youtube_refresh_token_enc: string | null
          youtube_token_expires_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          channel_style_goal?: string | null
          channel_summary_prompt?: string | null
          created_at?: string
          id?: string
          name?: string | null
          onboarding_completed_at?: string | null
          stripe_connect_account_id?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          updated_at?: string
          user_id: string
          youtube_access_token_enc?: string | null
          youtube_channel_id?: string | null
          youtube_connected_at?: string | null
          youtube_refresh_token_enc?: string | null
          youtube_token_expires_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          channel_style_goal?: string | null
          channel_summary_prompt?: string | null
          created_at?: string
          id?: string
          name?: string | null
          onboarding_completed_at?: string | null
          stripe_connect_account_id?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          updated_at?: string
          user_id?: string
          youtube_access_token_enc?: string | null
          youtube_channel_id?: string | null
          youtube_connected_at?: string | null
          youtube_refresh_token_enc?: string | null
          youtube_token_expires_at?: string | null
        }
        Relationships: []
      }
      runs: {
        Row: {
          agent_metrics: Json | null
          collector_export_error: string | null
          collector_export_status: string | null
          completed_at: string | null
          cost_tokens: number | null
          cost_usd: number | null
          error_message: string | null
          id: string
          memory_applied: Json | null
          model: string | null
          quality_delta: Json | null
          started_at: string
          status: string
          trace_id: string | null
          trace_url: string | null
          user_id: string
          video_id: string
        }
        Insert: {
          agent_metrics?: Json | null
          collector_export_error?: string | null
          collector_export_status?: string | null
          completed_at?: string | null
          cost_tokens?: number | null
          cost_usd?: number | null
          error_message?: string | null
          id?: string
          memory_applied?: Json | null
          model?: string | null
          quality_delta?: Json | null
          started_at?: string
          status?: string
          trace_id?: string | null
          trace_url?: string | null
          user_id: string
          video_id: string
        }
        Update: {
          agent_metrics?: Json | null
          collector_export_error?: string | null
          collector_export_status?: string | null
          completed_at?: string | null
          cost_tokens?: number | null
          cost_usd?: number | null
          error_message?: string | null
          id?: string
          memory_applied?: Json | null
          model?: string | null
          quality_delta?: Json | null
          started_at?: string
          status?: string
          trace_id?: string | null
          trace_url?: string | null
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      run_feedback: {
        Row: {
          agent_name: string | null
          applies_globally: boolean
          artifact_id: string | null
          created_at: string
          feedback_weight: number
          free_text: string | null
          id: string
          reason_code: string
          run_id: string
          user_id: string
          video_id: string
        }
        Insert: {
          agent_name?: string | null
          applies_globally?: boolean
          artifact_id?: string | null
          created_at?: string
          feedback_weight?: number
          free_text?: string | null
          id?: string
          reason_code: string
          run_id: string
          user_id: string
          video_id: string
        }
        Update: {
          agent_name?: string | null
          applies_globally?: boolean
          artifact_id?: string | null
          created_at?: string
          feedback_weight?: number
          free_text?: string | null
          id?: string
          reason_code?: string
          run_id?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_feedback_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_feedback_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_feedback_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      external_insights: {
        Row: {
          applied_to_memory: boolean
          created_at: string
          id: string
          insight_type: string
          insights: Json
          raw_summary: string | null
          score: number | null
          source: string
          user_id: string
          video_id: string | null
        }
        Insert: {
          applied_to_memory?: boolean
          created_at?: string
          id?: string
          insight_type?: string
          insights?: Json
          raw_summary?: string | null
          score?: number | null
          source: string
          user_id: string
          video_id?: string | null
        }
        Update: {
          applied_to_memory?: boolean
          created_at?: string
          id?: string
          insight_type?: string
          insights?: Json
          raw_summary?: string | null
          score?: number | null
          source?: string
          user_id?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_insights_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          created_at: string
          description: string | null
          id: string
          latest_youtube_sync_at: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          youtube_published_at: string | null
          youtube_video_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          latest_youtube_sync_at?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
          youtube_published_at?: string | null
          youtube_video_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          latest_youtube_sync_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          youtube_published_at?: string | null
          youtube_video_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
