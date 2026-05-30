import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Link2, MessageSquare, Mail, Copy, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getFleetContext } from "@/lib/fleet-auth";
import { apiJson, siteBaseUrl } from "@/lib/remote-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const Route = createFileRoute("/_authenticated/drivers")({
  head: () => ({ meta: [{ title: "Drivers — EcoTrack" }] }),
  beforeLoad: async () => {
    const ctx = await getFleetContext();
    if (!ctx.isAdmin) throw redirect({ to: ctx.isDriver ? "/my-track" : "/dashboard" });
  },
  component: DriversPage,
});

type DriverRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  license_number: string | null;
  vehicle_id: string | null;
  user_id: string | null;
  invited_at: string | null;
  vehicles: { plate_number: string } | null;
  sms_count: number;
};

function DriversPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [inviteAfterCreate, setInviteAfterCreate] = useState(true);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    license_number: "",
    phone: "",
    email: "",
    vehicle_id: "",
  });

  const { data: fleetCtx } = useQuery({ queryKey: ["fleet-context"], queryFn: getFleetContext });

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("id, plate_number").order("plate_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data, error: loadError, isLoading } = useQuery({
    queryKey: ["drivers"],
    queryFn: async (): Promise<DriverRow[]> => {
      const { data: rows, error } = await supabase
        .from("drivers")
        .select("id, full_name, phone, email, license_number, vehicle_id, user_id, invited_at, created_at, vehicles(plate_number)")
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      const { data: smsRows } = await supabase.from("sms_logs").select("driver_id");
      const smsCount: Record<string, number> = {};
      for (const s of smsRows ?? []) {
        if (s.driver_id) smsCount[s.driver_id] = (smsCount[s.driver_id] ?? 0) + 1;
      }

      return (rows ?? []).map((d) => ({
        ...d,
        vehicles: d.vehicles as DriverRow["vehicles"],
        sms_count: smsCount[d.id] ?? 0,
      }));
    },
  });

  const sendInvite = async (driverId: string) => {
    setInvitingId(driverId);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setInvitingId(null);
      return toast.error("You must be signed in");
    }

    let result: {
      ok: boolean;
      error?: string;
      email?: string;
      inviteLink?: string;
      emailSent?: boolean;
      emailError?: string;
    };

    try {
      result = await apiJson("/api/drivers/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ driverId, siteUrl: siteBaseUrl() }),
      });
    } catch (err) {
      setInvitingId(null);
      return toast.error(err instanceof Error ? err.message : "Invite failed");
    }
    setInvitingId(null);

    if (!result.ok) {
      return toast.error(result.error ?? "Invite failed");
    }

    qc.invalidateQueries({ queryKey: ["drivers"] });

    if (result.inviteLink) {
      setLastInviteLink(result.inviteLink);
    }

    if (result.emailSent) {
      toast.success(`Invite email sent to ${result.email}`);
    } else {
      toast.warning(
        result.emailError
          ? `Email not sent: ${result.emailError}. Copy the invite link below and send via WhatsApp/SMS.`
          : "Email not sent (configure SMTP in Supabase → Authentication → Email). Copy the link below.",
        { duration: 8000 }
      );
    }

    if (result.inviteLink) {
      try {
        await navigator.clipboard.writeText(result.inviteLink);
        setCopiedLink(driverId);
        setTimeout(() => setCopiedLink(null), 3000);
      } catch {
        /* link shown in banner */
      }
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email?.trim()) return toast.error("Email required for invite");
    if (!form.phone?.trim()) return toast.error("Phone required for SMS alerts");

    const payload = {
      full_name: form.full_name,
      license_number: form.license_number || null,
      phone: form.phone,
      email: form.email.trim().toLowerCase(),
      vehicle_id: form.vehicle_id || null,
    };

    const { data: driver, error } = await supabase.from("drivers").insert(payload).select("id").single();
    if (error) {
      if (error.message.includes("row-level security")) {
        return toast.error(
          "Permission denied — your account needs super_admin or fleet_manager role. Run the latest SQL migrations in Supabase."
        );
      }
      return toast.error(error.message);
    }

    if (form.vehicle_id) {
      await supabase.from("vehicles").update({ driver_id: driver.id }).eq("id", form.vehicle_id);
    }

    setOpen(false);
    setForm({ full_name: "", license_number: "", phone: "", email: "", vehicle_id: "" });
    await qc.invalidateQueries({ queryKey: ["drivers"] });
    toast.success("Driver saved");

    if (inviteAfterCreate) {
      await sendInvite(driver.id);
    }
  };

  const remove = async (id: string) => {
    await supabase.from("vehicles").update({ driver_id: null }).eq("driver_id", id);
    const { error } = await supabase.from("drivers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["drivers"] });
  };

  const assignVehicle = async (driverId: string, vehicleId: string) => {
    await supabase.from("drivers").update({ vehicle_id: vehicleId || null }).eq("id", driverId);
    if (vehicleId) {
      await supabase.from("vehicles").update({ driver_id: driverId }).eq("id", vehicleId);
    }
    qc.invalidateQueries({ queryKey: ["drivers"] });
    toast.success("Vehicle assigned");
  };

  const accountBadge = (d: DriverRow) => {
    if (d.user_id) {
      return (
        <Badge variant="default" className="mt-1 text-[10px]">
          <Link2 className="h-3 w-3 mr-1" />
          Active
        </Badge>
      );
    }
    if (d.invited_at) {
      return (
        <Badge variant="secondary" className="mt-1 text-[10px]">
          <Mail className="h-3 w-3 mr-1" />
          Invited
        </Badge>
      );
    }
    return <span className="text-xs text-muted-foreground">Not invited</span>;
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Drivers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Add a driver, then invite. If email does not arrive, copy the invite link (WhatsApp works too).
            {fleetCtx?.role && (
              <span className="block text-xs mt-1">Signed in as: {fleetCtx.role.replace("_", " ")}</span>
            )}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add driver
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New driver</DialogTitle>
            </DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email (invite link)</Label>
                <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Phone (SMS alerts)</Label>
                <Input required placeholder="+255..." value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>License number</Label>
                <Input value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Assign vehicle</Label>
                <Select value={form.vehicle_id} onValueChange={(v) => setForm({ ...form, vehicle_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    {(vehicles ?? []).map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.plate_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={inviteAfterCreate}
                  onChange={(e) => setInviteAfterCreate(e.target.checked)}
                />
                Send invite immediately
              </label>
              <Button type="submit" className="w-full">
                Create {inviteAfterCreate ? "& invite" : ""}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {lastInviteLink && (
        <Alert>
          <Mail className="h-4 w-4" />
          <AlertTitle>Invite link — share with driver</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-xs break-all font-mono bg-muted/50 p-2 rounded">{lastInviteLink}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(lastInviteLink);
                toast.success("Copied");
              }}
            >
              <Copy className="h-3 w-3 mr-1" /> Copy link
            </Button>
            <p className="text-xs text-muted-foreground">
              Supabase only sends emails when SMTP is configured (Dashboard → Authentication → Email → SMTP).
              Until then, paste this link in WhatsApp or SMS.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {loadError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load drivers</AlertTitle>
          <AlertDescription>
            {loadError.message}
            <span className="block mt-1 text-xs">
              Run all files in <code className="bg-muted px-1 rounded">supabase/migrations/</code> in the Supabase SQL
              Editor, then refresh.
            </span>
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Phone</th>
              <th className="px-4 py-3 text-left">Email / Account</th>
              <th className="px-4 py-3 text-left">Vehicle</th>
              <th className="px-4 py-3 text-left">SMS</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Loading drivers…
                </td>
              </tr>
            )}
            {!isLoading &&
              (data ?? []).map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{d.full_name}</td>
                  <td className="px-4 py-3">{d.phone}</td>
                  <td className="px-4 py-3">
                    <div>{d.email}</div>
                    {accountBadge(d)}
                  </td>
                  <td className="px-4 py-3">
                    <Select value={d.vehicle_id ?? ""} onValueChange={(v) => assignVehicle(d.id, v)}>
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue placeholder="Assign" />
                      </SelectTrigger>
                      <SelectContent>
                        {(vehicles ?? []).map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.plate_number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <MessageSquare className="h-3 w-3 inline mr-1" />
                    {d.sms_count} sent
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {!d.user_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={invitingId === d.id}
                          onClick={() => sendInvite(d.id)}
                        >
                          {invitingId === d.id ? (
                            "Sending…"
                          ) : copiedLink === d.id ? (
                            <>
                              <Check className="h-3 w-3 mr-1" /> Copied
                            </>
                          ) : (
                            <>
                              <Mail className="h-3 w-3 mr-1" /> Invite
                            </>
                          )}
                        </Button>
                      )}
                      {!d.user_id && d.invited_at && (
                        <Button size="sm" variant="ghost" onClick={() => sendInvite(d.id)} title="Resend / copy link">
                          <Copy className="h-3 w-3" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => remove(d.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            {!isLoading && !loadError && (data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No drivers yet. Click <strong>Add driver</strong> above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
