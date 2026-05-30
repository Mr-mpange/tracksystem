import { createFileRoute } from "@tanstack/react-router";

/** GET /api/config/ussd — public USSD setup info for admin UI */
export const Route = createFileRoute("/api/config/ussd")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = request.headers.get("origin") || process.env.SITE_URL || "http://localhost:5173";
        const base = origin.replace(/\/$/, "");
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
        const supabaseProject = supabaseUrl.replace("https://", "").replace(".supabase.co", "");
        const edgeUssdUrl = supabaseProject
          ? `https://${supabaseProject}.supabase.co/functions/v1/ussd`
          : null;

        return new Response(
          JSON.stringify({
            callbackUrl: edgeUssdUrl ?? `${base}/api/public/ussd`,
            callbackUrlApp: `${base}/api/public/ussd`,
            callbackUrlSupabase: edgeUssdUrl,
            ussdCode: process.env.AT_USSD_CODE || null,
            menu: [
              { key: "1", label: "My schedule (next 7 days)" },
              { key: "2", label: "Report to admin" },
              { key: "0", label: "Exit" },
            ],
            atDashboardSteps: [
              "Log in to https://account.africastalking.com",
              "Go to SMS → USSD (or USSD product in Sandbox)",
              "Create / select your USSD service code (e.g. *384*12345#)",
              `Set Callback URL to: ${edgeUssdUrl ?? base + "/api/public/ussd"} (Supabase Edge Function recommended)`,
              "Method: POST",
              "Save — drivers must dial from phones listed in Drivers page",
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      },
    },
  },
});
