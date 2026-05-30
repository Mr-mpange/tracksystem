/** USSD setup info for admin UI (no server needed on GitHub Pages). */

export function getUssdConfig() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
  const project = supabaseUrl.replace("https://", "").replace(".supabase.co", "");
  const edgeUssdUrl = project ? `https://${project}.supabase.co/functions/v1/ussd` : null;
  const siteBase =
    typeof window !== "undefined"
      ? `${window.location.origin}${import.meta.env.BASE_URL || "/"}`.replace(/\/$/, "")
      : "https://mr-mpange.github.io/tracksystem";

  return {
    callbackUrl: edgeUssdUrl ?? `${siteBase}/api/public/ussd`,
    callbackUrlApp: `${siteBase}/api/public/ussd`,
    callbackUrlSupabase: edgeUssdUrl,
    ussdCode: import.meta.env.VITE_AT_USSD_CODE ?? null,
    menu: [
      { key: "1", label: "My schedule (next 7 days)" },
      { key: "2", label: "Report to admin" },
      { key: "0", label: "Exit" },
    ],
    atDashboardSteps: [
      "Log in to https://account.africastalking.com",
      "Go to SMS → USSD (or USSD product in Sandbox)",
      "Create / select your USSD service code (e.g. *384*12345#)",
      `Set Callback URL to: ${edgeUssdUrl ?? `${siteBase}/api/public/ussd`} (Supabase Edge Function recommended)`,
      "Method: POST",
      "Save — drivers must dial from phones listed in Drivers page",
    ],
  };
}
