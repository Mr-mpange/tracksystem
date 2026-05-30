import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getFleetContext } from "@/lib/fleet-auth";
import { apiJson } from "@/lib/remote-api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({ meta: [{ title: "Bulk SMS — EcoTrack" }] }),
  beforeLoad: async () => {
    const ctx = await getFleetContext();
    if (!ctx.isAdmin) throw redirect({ to: "/my-track" });
  },
  component: MessagesPage,
});

function MessagesPage() {
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const { data: drivers } = useQuery({
    queryKey: ["drivers-sms"],
    queryFn: async () =>
      (await supabase.from("drivers").select("id, full_name, phone").not("phone", "is", null).order("full_name")).data ?? [],
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === (drivers?.length ?? 0)) {
      setSelected(new Set());
    } else {
      setSelected(new Set((drivers ?? []).map((d) => d.id)));
    }
  };

  const sendBulk = async () => {
    if (!message.trim()) return toast.error("Enter a message");
    const ids = selected.size > 0 ? [...selected] : (drivers ?? []).map((d) => d.id);
    if (ids.length === 0) return toast.error("No drivers selected");

    setSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setSending(false);
      return toast.error("Sign in required");
    }

    let result: { ok?: boolean; sent?: number; failed?: number; error?: string };
    try {
      result = await apiJson("/api/sms/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ message: message.trim(), driverIds: ids }),
      });
    } catch (err) {
      setSending(false);
      return toast.error(err instanceof Error ? err.message : "Bulk SMS failed");
    }
    setSending(false);

    if (!result.ok && result.sent === 0) {
      return toast.error(result.error ?? "Bulk SMS failed");
    }

    toast.success(`Sent to ${result.sent ?? 0} driver(s)${result.failed ? `, ${result.failed} failed` : ""}`);
    setMessage("");
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-3xl font-semibold flex items-center gap-2">
          <MessageSquare className="h-7 w-7 text-primary" />
          Bulk SMS
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Send Africa&apos;s Talking SMS to drivers (announcements, emergencies, schedule changes).
        </p>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="space-y-2">
          <Label>Message</Label>
          <Textarea
            rows={4}
            maxLength={480}
            placeholder="e.g. All drivers: team meeting tomorrow 8am at depot."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{message.length}/480 characters</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Recipients ({selected.size || drivers?.length || 0} selected)</Label>
            <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
              {selected.size === (drivers?.length ?? 0) ? "Deselect all" : "Select all"}
            </Button>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
            {(drivers ?? []).map((d) => (
              <label key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                <Checkbox
                  checked={selected.has(d.id)}
                  onCheckedChange={() => toggle(d.id)}
                />
                <span className="font-medium">{d.full_name}</span>
                <span className="text-muted-foreground ml-auto">{d.phone}</span>
              </label>
            ))}
            {(drivers?.length ?? 0) === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No drivers with phone numbers.</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Leave none selected to send to all drivers with a phone.</p>
        </div>

        <Button onClick={sendBulk} disabled={sending} className="w-full">
          <Send className="mr-2 h-4 w-4" />
          {sending ? "Sending…" : "Send bulk SMS"}
        </Button>
      </div>
    </div>
  );
}
