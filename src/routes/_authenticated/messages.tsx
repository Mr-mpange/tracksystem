import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MessageSquare, Send, Smartphone, ExternalLink, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getFleetContext } from "@/lib/fleet-auth";
import { apiJson } from "@/lib/remote-api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const TEST_PHONE = "0683859574";
const SANDBOX_E164 = "+255683859574";
const SIMULATOR_URL = "https://simulator.africastalking.com:1517/";
const OUTBOX_URL = "https://account.africastalking.com/apps/sandbox/sms/outbox";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({ meta: [{ title: "Bulk SMS — EcoTrack" }] }),
  beforeLoad: async () => {
    const ctx = await getFleetContext();
    if (!ctx.isAdmin) throw redirect({ to: "/my-track" });
  },
  component: MessagesPage,
});

type SmsApiResult = {
  ok?: boolean;
  sent?: number;
  failed?: number;
  error?: string;
  isSandbox?: boolean;
  sandboxNote?: string | null;
  simulatorUrl?: string;
  outboxUrl?: string;
  atMessage?: string;
  status?: string;
  phone?: string;
  results?: Array<{ phone: string; ok: boolean; status?: string; error?: string }>;
};

function MessagesPage() {
  const [message, setMessage] = useState("EcoTrack test — hello from fleet admin");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<SmsApiResult | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: drivers } = useQuery({
    queryKey: ["drivers-sms"],
    queryFn: async () =>
      (await supabase.from("drivers").select("id, full_name, phone").not("phone", "is", null).order("full_name")).data ?? [],
  });

  const copyNumber = async () => {
    await navigator.clipboard.writeText(SANDBOX_E164);
    setCopied(true);
    toast.success("Copied — paste this exact number in the AT Simulator");
    setTimeout(() => setCopied(false), 2000);
  };

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

  const sendTestSms = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return toast.error("Sign in required");

    setSending(true);
    try {
      const result = await apiJson<SmsApiResult>("/api/sms/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ phone: TEST_PHONE, message: message.trim() || "EcoTrack test" }),
      });
      setLastResult(result);
      if (result.ok) {
        toast.success(
          result.isSandbox
            ? "Sent to sandbox API. Open the AT Simulator (step 1) to read the message."
            : `SMS sent — status: ${result.status}`
        );
      } else {
        toast.error(result.error ?? result.atMessage ?? "Test failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setSending(false);
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

    try {
      const result = await apiJson<SmsApiResult>("/api/sms/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ message: message.trim(), driverIds: ids }),
      });
      setLastResult(result);

      if (!result.ok && (result.sent ?? 0) === 0) {
        toast.error(result.error ?? result.atMessage ?? "Bulk SMS failed");
        return;
      }

      toast.success(
        result.isSandbox
          ? `${result.sent} message(s) in sandbox — open AT Simulator to read them`
          : `Sent to ${result.sent} driver(s)${result.failed ? `, ${result.failed} failed` : ""}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk SMS failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-3xl font-semibold flex items-center gap-2">
          <MessageSquare className="h-7 w-7 text-primary" />
          Bulk SMS
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sandbox sends to <strong>{SANDBOX_E164}</strong> (from {TEST_PHONE}) — view on the{" "}
          <strong>AT Simulator</strong>, not your physical phone.
        </p>
      </div>

      <Alert className="border-primary/40 bg-primary/5">
        <Smartphone className="h-4 w-4" />
        <AlertTitle>How to receive SMS in sandbox (3 steps)</AlertTitle>
        <AlertDescription className="text-sm space-y-3">
          <ol className="list-decimal pl-4 space-y-2">
            <li>
              Open{" "}
              <a href={SIMULATOR_URL} target="_blank" rel="noreferrer" className="text-primary font-medium underline">
                AT SMS Simulator <ExternalLink className="inline h-3 w-3" />
              </a>
              {" "}in a new tab.
            </li>
            <li>
              Register this number <strong>exactly</strong> (copy — must match EcoTrack):
              <div className="mt-1 flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 text-sm font-mono">{SANDBOX_E164}</code>
                <Button type="button" variant="outline" size="sm" onClick={copyNumber}>
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  Copy
                </Button>
              </div>
            </li>
            <li>
              Click <strong>Test SMS</strong> below — the message appears in the Simulator inbox (and{" "}
              <a href={OUTBOX_URL} target="_blank" rel="noreferrer" className="text-primary underline">
                Sandbox Outbox
              </a>
              ).
            </li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Africa&apos;s Talking does not deliver sandbox SMS to handset {TEST_PHONE}. USSD works on a real phone
            because it uses a different channel; SMS sandbox only uses the Simulator.
          </p>
        </AlertDescription>
      </Alert>

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

        <Button type="button" variant="default" className="w-full" onClick={sendTestSms} disabled={sending}>
          {sending ? "Sending…" : `3. Send test SMS → ${SANDBOX_E164}`}
        </Button>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Bulk recipients ({selected.size || drivers?.length || 0} selected)</Label>
            <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
              {selected.size === (drivers?.length ?? 0) ? "Deselect all" : "Select all"}
            </Button>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
            {(drivers ?? []).map((d) => (
              <label key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                <Checkbox checked={selected.has(d.id)} onCheckedChange={() => toggle(d.id)} />
                <span className="font-medium">{d.full_name}</span>
                <span className="text-muted-foreground ml-auto font-mono text-xs">{d.phone}</span>
              </label>
            ))}
            {(drivers?.length ?? 0) === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                No drivers with phones. Add a driver with <strong>{TEST_PHONE}</strong> for bulk tests.
              </p>
            )}
          </div>
        </div>

        <Button onClick={sendBulk} disabled={sending} variant="secondary" className="w-full">
          <Send className="mr-2 h-4 w-4" />
          {sending ? "Sending…" : "Send bulk SMS"}
        </Button>
      </div>

      {lastResult && (
        <Alert variant={lastResult.ok ? "default" : "destructive"}>
          <AlertTitle>{lastResult.ok ? "API: message accepted by sandbox" : "API error"}</AlertTitle>
          <AlertDescription className="text-sm space-y-2">
            {lastResult.ok && lastResult.isSandbox && (
              <p className="font-medium text-primary">
                Now check the AT Simulator tab — inbox for {SANDBOX_E164}.
              </p>
            )}
            {lastResult.atMessage && <p className="text-xs font-mono">{lastResult.atMessage}</p>}
            {lastResult.status && <p className="text-xs">Status: {lastResult.status}</p>}
            {lastResult.sandboxNote && <p>{lastResult.sandboxNote}</p>}
            {lastResult.results?.map((r) => (
              <p key={r.phone} className="text-xs font-mono">
                {r.phone}: {r.ok ? "Success" : "Failed"} {r.status ?? r.error ?? ""}
              </p>
            ))}
            {lastResult.ok && lastResult.isSandbox && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" asChild>
                  <a href={SIMULATOR_URL} target="_blank" rel="noreferrer">
                    Open Simulator <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={OUTBOX_URL} target="_blank" rel="noreferrer">
                    Open Outbox <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
