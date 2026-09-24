// Hand-written types matching supabase/schema.sql. Supabase's client requires
// an explicit Database generic to type .from()/.rpc() calls — there's no
// Supabase CLI codegen step in this project, so these are kept in sync by
// hand with the schema. Every table needs `Relationships` (even if empty) or
// Supabase's query builder silently resolves its row types to `never`.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      pairs: {
        Row: { id: string; code: string; created_at: string };
        Insert: { id?: string; code: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["pairs"]["Row"]>;
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          pair_id: string | null;
          status: string;
          round: number;
          partnerA_claimed: boolean;
          partnerA_token: string;
          partnerB_claimed: boolean;
          partnerB_token: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          pair_id?: string | null;
          status?: string;
          round?: number;
          partnerA_claimed?: boolean;
          partnerA_token?: string;
          partnerB_claimed?: boolean;
          partnerB_token?: string | null;
          expires_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sessions"]["Insert"]>;
        Relationships: [];
      };
      preferences: {
        Row: {
          id: string;
          session_id: string;
          partner: string;
          mood: string[];
          mood_freetext: string;
          languages: string[];
          content_type: string;
          min_rating: number;
          eras: string[];
          submitted_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["preferences"]["Row"]> & {
          session_id: string;
          partner: string;
          content_type: string;
          min_rating: number;
        };
        Update: Partial<Database["public"]["Tables"]["preferences"]["Row"]>;
        Relationships: [];
      };
      title_pools: {
        Row: {
          id: string;
          session_id: string;
          round: number;
          tmdb_id: number;
          media_type: string;
          title: string;
          year: number | null;
          poster_path: string | null;
          imdb_rating: number | null;
          runtime: number | null;
          synopsis: string;
          ott_platforms: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["title_pools"]["Row"]> & {
          session_id: string;
          round: number;
          tmdb_id: number;
          media_type: string;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["title_pools"]["Row"]>;
        Relationships: [];
      };
      swipes: {
        Row: {
          id: string;
          session_id: string;
          round: number;
          partner: string;
          tmdb_id: number;
          direction: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["swipes"]["Row"]> & {
          session_id: string;
          round: number;
          partner: string;
          tmdb_id: number;
          direction: string;
        };
        Update: Partial<Database["public"]["Tables"]["swipes"]["Row"]>;
        Relationships: [];
      };
      round_completions: {
        Row: { session_id: string; round: number; partner: string; completed_at: string };
        Insert: { session_id: string; round: number; partner: string; completed_at?: string };
        Update: Partial<Database["public"]["Tables"]["round_completions"]["Row"]>;
        Relationships: [];
      };
      matches: {
        Row: { id: string; session_id: string; round: number; tmdb_id: number; matched_at: string };
        Insert: { id?: string; session_id: string; round: number; tmdb_id: number; matched_at?: string };
        Update: Partial<Database["public"]["Tables"]["matches"]["Row"]>;
        Relationships: [];
      };
      ratings: {
        Row: {
          id: string;
          session_id: string;
          tmdb_id: number;
          partner: string;
          rating: number;
          review: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ratings"]["Row"]> & {
          session_id: string;
          tmdb_id: number;
          partner: string;
          rating: number;
        };
        Update: Partial<Database["public"]["Tables"]["ratings"]["Row"]>;
        Relationships: [];
      };
      title_cache: {
        Row: {
          tmdb_id: number;
          region: string;
          imdb_rating: number | null;
          runtime: number | null;
          ott_platforms: Json;
          fetched_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["title_cache"]["Row"]> & { tmdb_id: number };
        Update: Partial<Database["public"]["Tables"]["title_cache"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      claim_partner_b: {
        Args: { p_session_id: string };
        Returns: { token: string }[];
      };
      submit_preferences: {
        Args: {
          p_session_id: string;
          p_partner: string;
          p_mood: string[];
          p_mood_freetext: string;
          p_languages: string[];
          p_content_type: string;
          p_min_rating: number;
          p_eras: string[];
        };
        Returns: { triggered: boolean }[];
      };
      record_swipe: {
        Args: {
          p_session_id: string;
          p_round: number;
          p_partner: string;
          p_tmdb_id: number;
          p_direction: string;
        };
        Returns: { matched: boolean }[];
      };
      complete_round: {
        Args: { p_session_id: string; p_round: number; p_partner: string };
        Returns: { triggered_next: string | null }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
