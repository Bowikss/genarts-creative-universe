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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      appointment_events: {
        Row: {
          appointment_id: string
          created_at: string
          id: string
          notify: boolean
          performed_by: string | null
          step: Database["public"]["Enums"]["appt_status"]
        }
        Insert: {
          appointment_id: string
          created_at?: string
          id?: string
          notify?: boolean
          performed_by?: string | null
          step: Database["public"]["Enums"]["appt_status"]
        }
        Update: {
          appointment_id?: string
          created_at?: string
          id?: string
          notify?: boolean
          performed_by?: string | null
          step?: Database["public"]["Enums"]["appt_status"]
        }
        Relationships: [
          {
            foreignKeyName: "appointment_events_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_notes: {
        Row: {
          appointment_id: string
          author: string | null
          body: string
          created_at: string
          id: string
          kind: string
        }
        Insert: {
          appointment_id: string
          author?: string | null
          body: string
          created_at?: string
          id?: string
          kind?: string
        }
        Update: {
          appointment_id?: string
          author?: string | null
          body?: string
          created_at?: string
          id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_notes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_photos: {
        Row: {
          appointment_id: string
          author: string | null
          created_at: string
          id: string
          path: string
        }
        Insert: {
          appointment_id: string
          author?: string | null
          created_at?: string
          id?: string
          path: string
        }
        Update: {
          appointment_id?: string
          author?: string | null
          created_at?: string
          id?: string
          path?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_photos_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          assigned_employee: string | null
          completed_at: string | null
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          ends_at: string
          id: string
          make: string
          model: string
          notify_customer: boolean
          reg_number: string
          service_id: string
          started_at: string | null
          starts_at: string
          station_id: string | null
          status: Database["public"]["Enums"]["appt_status"]
          tracking_token: string | null
        }
        Insert: {
          assigned_employee?: string | null
          completed_at?: string | null
          created_at?: string
          customer_email?: string
          customer_name: string
          customer_phone?: string
          ends_at: string
          id?: string
          make?: string
          model?: string
          notify_customer?: boolean
          reg_number: string
          service_id: string
          started_at?: string | null
          starts_at: string
          station_id?: string | null
          status?: Database["public"]["Enums"]["appt_status"]
          tracking_token?: string | null
        }
        Update: {
          assigned_employee?: string | null
          completed_at?: string | null
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          ends_at?: string
          id?: string
          make?: string
          model?: string
          notify_customer?: boolean
          reg_number?: string
          service_id?: string
          started_at?: string | null
          starts_at?: string
          station_id?: string | null
          status?: Database["public"]["Enums"]["appt_status"]
          tracking_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean
          created_at: string
          duration_min: number
          id: string
          name: string
          price: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          duration_min?: number
          id?: string
          name: string
          price?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          duration_min?: number
          id?: string
          name?: string
          price?: number
        }
        Relationships: []
      }
      station_employees: {
        Row: {
          station_id: string
          user_id: string
        }
        Insert: {
          station_id: string
          user_id: string
        }
        Update: {
          station_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_employees_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      station_services: {
        Row: {
          service_id: string
          station_id: string
        }
        Insert: {
          service_id: string
          station_id: string
        }
        Update: {
          service_id?: string
          station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_services_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      station_unavailability: {
        Row: {
          ends_at: string
          id: string
          reason: string
          starts_at: string
          station_id: string
        }
        Insert: {
          ends_at: string
          id?: string
          reason?: string
          starts_at: string
          station_id: string
        }
        Update: {
          ends_at?: string
          id?: string
          reason?: string
          starts_at?: string
          station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_unavailability_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          close_time: string
          created_at: string
          id: string
          name: string
          number: number
          open_time: string
          out_of_service: boolean
        }
        Insert: {
          close_time?: string
          created_at?: string
          id?: string
          name: string
          number: number
          open_time?: string
          out_of_service?: boolean
        }
        Update: {
          close_time?: string
          created_at?: string
          id?: string
          name?: string
          number?: number
          open_time?: string
          out_of_service?: boolean
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "employee"
      appt_status:
        | "confirmed"
        | "arrived"
        | "checked_in"
        | "washing"
        | "exterior_done"
        | "interior_done"
        | "quality_check"
        | "ready"
        | "picked_up"
        | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "employee"],
      appt_status: [
        "confirmed",
        "arrived",
        "checked_in",
        "washing",
        "exterior_done",
        "interior_done",
        "quality_check",
        "ready",
        "picked_up",
        "cancelled",
      ],
    },
  },
} as const
