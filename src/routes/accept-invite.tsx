import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Leaf } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/accept-invite")({
  head: () => ({ meta: [{ title: "Accept invite — EcoTrack" }] }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function initSession() {
      // PKCE / token_hash query params (Supabase invite email)
      const params = new URLSearchParams(window.location.search);
      const token_hash = params.get("token_hash");
      const type = params.get("type");

      if (token_hash && type === "invite") {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type: "invite" });
        if (error && !cancelled) {
          toast.error(error.message);
          setLoading(false);
          return;
        }
      }

      // Hash fragment tokens (legacy / redirect flow)
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error && !cancelled) {
          toast.error(error.message);
          setLoading(false);
          return;
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled) {
        setReady(!!session);
        setLoading(false);
        if (!session) {
          toast.error("Invite link expired or invalid. Ask your admin to resend.");
        }
      }
    }

    initSession();
    return () => { cancelled = true; };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    if (password !== confirm) return toast.error("Passwords do not match");

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) return toast.error(error.message);

    toast.success("Account ready! Welcome to EcoTrack.");
    navigate({ to: "/my-track" });
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-4">
        <p className="text-muted-foreground">Verifying your invite…</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-4">
        <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center">
          <p className="text-muted-foreground">Could not verify invite. Contact your fleet admin for a new link.</p>
          <Button className="mt-4" variant="outline" onClick={() => navigate({ to: "/login" })}>
            Go to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-2xl shadow-black/20">
        <div className="mb-6 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <Leaf className="h-4 w-4" />
          </div>
          <span className="font-display text-lg font-semibold">EcoTrack</span>
        </div>
        <h1 className="text-2xl font-semibold">Set your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You were invited as a driver. Create a password to access My Track.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Saving…" : "Activate account"}
          </Button>
        </form>
      </div>
    </div>
  );
}
