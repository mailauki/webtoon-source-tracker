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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      entry_sources: {
        Row: {
          chapters_read: number | null
          created_at: string
          entry_id: number
          id: number
          is_official: boolean
          is_paid: boolean
          is_primary: boolean
          notes: string | null
          source_id: number
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          chapters_read?: number | null
          created_at?: string
          entry_id: number
          id?: never
          is_official?: boolean
          is_paid?: boolean
          is_primary?: boolean
          notes?: string | null
          source_id: number
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          chapters_read?: number | null
          created_at?: string
          entry_id?: number
          id?: never
          is_official?: boolean
          is_paid?: boolean
          is_primary?: boolean
          notes?: string | null
          source_id?: number
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_sources_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "user_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_sources_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      library_prefs: {
        Row: {
          sort: string | null
          source: string | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          sort?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          sort?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mal_connections: {
        Row: {
          connected_at: string
          last_synced_at: string | null
          mal_picture_url: string | null
          mal_user_id: number
          mal_username: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          last_synced_at?: string | null
          mal_picture_url?: string | null
          mal_user_id: number
          mal_username: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string
          last_synced_at?: string | null
          mal_picture_url?: string | null
          mal_user_id?: number
          mal_username?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mal_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_titles: {
        Row: {
          created_at: string
          id: number
          main_picture_url: string | null
          mal_media_id: number
          mal_media_kind: string | null
          mal_status: string | null
          media_type: string
          num_chapters: number | null
          num_volumes: number | null
          synced_at: string
          title: string
          title_en: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          main_picture_url?: string | null
          mal_media_id: number
          mal_media_kind?: string | null
          mal_status?: string | null
          media_type?: string
          num_chapters?: number | null
          num_volumes?: number | null
          synced_at?: string
          title: string
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          main_picture_url?: string | null
          mal_media_id?: number
          mal_media_kind?: string | null
          mal_status?: string | null
          media_type?: string
          num_chapters?: number | null
          num_volumes?: number | null
          synced_at?: string
          title?: string
          title_en?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          base_url: string | null
          created_at: string
          id: number
          is_active: boolean
          logo_url: string | null
          name: string
          owner_id: string | null
          parent_slug: string | null
          slug: string | null
          sort_order: number
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          logo_url?: string | null
          name: string
          owner_id?: string | null
          parent_slug?: string | null
          slug?: string | null
          sort_order?: number
        }
        Update: {
          base_url?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          parent_slug?: string | null
          slug?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "sources_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sources_parent_slug_fkey"
            columns: ["parent_slug"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["slug"]
          },
        ]
      }
      user_entries: {
        Row: {
          created_at: string
          id: number
          is_rereading: boolean
          list_status: string
          mal_updated_at: string | null
          num_chapters_read: number
          num_volumes_read: number
          score: number
          synced_at: string
          title_id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          is_rereading?: boolean
          list_status: string
          mal_updated_at?: string | null
          num_chapters_read?: number
          num_volumes_read?: number
          score?: number
          synced_at?: string
          title_id: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          is_rereading?: boolean
          list_status?: string
          mal_updated_at?: string | null
          num_chapters_read?: number
          num_volumes_read?: number
          score?: number
          synced_at?: string
          title_id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_entries_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "media_titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      mal_tokens_delete: { Args: { p_user_id: string }; Returns: undefined }
      mal_tokens_get: {
        Args: { p_user_id: string }
        Returns: {
          access_token: string
          refresh_token: string
        }[]
      }
      mal_tokens_upsert: {
        Args: {
          p_access_token: string
          p_expires_at?: string
          p_refresh_token: string
          p_token_type?: string
          p_user_id: string
        }
        Returns: undefined
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
