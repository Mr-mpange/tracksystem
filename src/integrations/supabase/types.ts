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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          created_at: string
          device_id: string | null
          id: string
          message: string
          metadata: Json | null
          severity: Database["public"]["Enums"]["alert_severity"]
          status: Database["public"]["Enums"]["alert_status"]
          type: Database["public"]["Enums"]["alert_type"]
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          id?: string
          message: string
          metadata?: Json | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          status?: Database["public"]["Enums"]["alert_status"]
          type: Database["public"]["Enums"]["alert_type"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          status?: Database["public"]["Enums"]["alert_status"]
          type?: Database["public"]["Enums"]["alert_type"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      carbon_logs: {
        Row: {
          created_at: string
          emission_kg: number
          fuel_used: number
          id: number
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          emission_kg: number
          fuel_used: number
          id?: number
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          emission_kg?: number
          fuel_used?: number
          id?: number
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carbon_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          id: string
          last_seen: string | null
          serial_number: string
          status: Database["public"]["Enums"]["device_status"]
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen?: string | null
          serial_number: string
          status?: Database["public"]["Enums"]["device_status"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_seen?: string | null
          serial_number?: string
          status?: Database["public"]["Enums"]["device_status"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_reports: {
        Row: {
          created_at: string
          driver_id: string | null
          id: string
          message: string
          phone_number: string
          source: Database["public"]["Enums"]["report_source"]
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_id?: string | null
          id?: string
          message: string
          phone_number: string
          source?: Database["public"]["Enums"]["report_source"]
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_id?: string | null
          id?: string
          message?: string
          phone_number?: string
          source?: Database["public"]["Enums"]["report_source"]
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_reports_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_location_pings: {
        Row: {
          accuracy_m: number | null
          created_at: string
          driver_id: string
          id: number
          latitude: number
          longitude: number
          source: string
          speed: number | null
          vehicle_id: string | null
        }
        Insert: {
          accuracy_m?: number | null
          created_at?: string
          driver_id: string
          id?: number
          latitude: number
          longitude: number
          source?: string
          speed?: number | null
          vehicle_id?: string | null
        }
        Update: {
          accuracy_m?: number | null
          created_at?: string
          driver_id?: string
          id?: number
          latitude?: number
          longitude?: number
          source?: string
          speed?: number | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_location_pings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_location_pings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          corridor_radius_m: number
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          waypoints: Json
        }
        Insert: {
          corridor_radius_m?: number
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          waypoints?: Json
        }
        Update: {
          corridor_radius_m?: number
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          waypoints?: Json
        }
        Relationships: []
      }
      driver_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          driver_id: string
          id: string
          last_route_check_at: string | null
          location: string | null
          off_route_count: number
          route_id: string | null
          route_status: Database["public"]["Enums"]["route_status"]
          scheduled_at: string
          status: Database["public"]["Enums"]["schedule_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          driver_id: string
          id?: string
          last_route_check_at?: string | null
          location?: string | null
          off_route_count?: number
          route_id?: string | null
          route_status?: Database["public"]["Enums"]["route_status"]
          scheduled_at: string
          status?: Database["public"]["Enums"]["schedule_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          driver_id?: string
          id?: string
          last_route_check_at?: string | null
          location?: string | null
          off_route_count?: number
          route_id?: string | null
          route_status?: Database["public"]["Enums"]["route_status"]
          scheduled_at?: string
          status?: Database["public"]["Enums"]["schedule_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_schedules_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_schedules_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          invited_at: string | null
          license_number: string | null
          phone: string | null
          updated_at: string
          user_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          invited_at?: string | null
          license_number?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          invited_at?: string | null
          license_number?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_logs: {
        Row: {
          alert_id: string | null
          created_at: string
          driver_id: string | null
          id: string
          message: string
          phone: string
          provider_response: Json | null
          status: string
        }
        Insert: {
          alert_id?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          message: string
          phone: string
          provider_response?: Json | null
          status?: string
        }
        Update: {
          alert_id?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          message?: string
          phone?: string
          provider_response?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_logs_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          alert_id: string | null
          body: string | null
          created_at: string
          id: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          alert_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          alert_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sensor_logs: {
        Row: {
          created_at: string
          device_id: string | null
          fuel_used: number | null
          id: number
          latitude: number | null
          longitude: number | null
          speed: number | null
          temperature: number | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          fuel_used?: number | null
          id?: number
          latitude?: number | null
          longitude?: number | null
          speed?: number | null
          temperature?: number | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          fuel_used?: number | null
          id?: number
          latitude?: number | null
          longitude?: number | null
          speed?: number | null
          temperature?: number | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sensor_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensor_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          created_at: string
          driver_id: string | null
          fuel_type: Database["public"]["Enums"]["fuel_type"]
          id: string
          model: string
          plate_number: string
          status: Database["public"]["Enums"]["vehicle_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_id?: string | null
          fuel_type?: Database["public"]["Enums"]["fuel_type"]
          id?: string
          model: string
          plate_number: string
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_id?: string | null
          fuel_type?: Database["public"]["Enums"]["fuel_type"]
          id?: string
          model?: string
          plate_number?: string
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_driver_fk"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_fleet: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      alert_severity: "info" | "warning" | "critical"
      alert_status: "open" | "acknowledged" | "resolved"
      alert_type: "high_temperature" | "device_offline" | "high_emission" | "off_route"
      route_status: "not_started" | "on_route" | "off_route" | "completed"
      app_role: "super_admin" | "fleet_manager" | "operator" | "driver"
      report_source: "ussd" | "app"
      report_status: "open" | "reviewed" | "resolved"
      schedule_status: "scheduled" | "completed" | "cancelled"
      device_status: "online" | "offline" | "warning"
      fuel_type: "gasoline" | "diesel"
      vehicle_status: "active" | "inactive" | "maintenance"
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
    Enums: {
      alert_severity: ["info", "warning", "critical"],
      alert_status: ["open", "acknowledged", "resolved"],
      alert_type: ["high_temperature", "device_offline", "high_emission", "off_route"],
      route_status: ["not_started", "on_route", "off_route", "completed"],
      app_role: ["super_admin", "fleet_manager", "operator", "driver"],
      report_source: ["ussd", "app"],
      report_status: ["open", "reviewed", "resolved"],
      schedule_status: ["scheduled", "completed", "cancelled"],
      device_status: ["online", "offline", "warning"],
      fuel_type: ["gasoline", "diesel"],
      vehicle_status: ["active", "inactive", "maintenance"],
    },
  },
} as const
