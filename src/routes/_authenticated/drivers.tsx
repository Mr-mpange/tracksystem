import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Link2, MessageSquare, Mail, Copy, Check } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/drivers")({
  head: () => ({ meta: [{ title: "Drivers — EcoTrack" }] }),
  beforeLoad: async () => {
    const ctx = await getFleetContext();
    if (!ctx.isAdmin) throw redirect({ to: ctx.isDriver ? "/my-track" : "/dashboard" });
  },
  component: DriversPage,
});

function DriversPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [inviteAfterCreate, setInviteAfterCreate] = useState(true);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    license_number: "",
    phone: "",
    email: "",
    vehicle_id: "",
  });

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles-list"],
    queryFn: async () => (await supabase.from("vehicles").select("id, plate_number").order("plate_number")).data ?? [],
  });

  const { data } = useQuery({
    queryKey: ["drivers"],
    queryFn: async () =>
      (
        await supabase
          .from("drivers")
          .select("*, vehicles(plate_number), sms_logs(id, created_at, status)")
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const sendInvite = async (driverId: string) => {
    setInvitingId(driverId);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setInvitingId(null);
      return toast.error("You must be signed in");
    }

    let result: { ok: boolean; error?: string; email?: string; inviteLink?: string; emailSent?: boolean };
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

    if (result.emailSent) {
      toast.success(`Invite email sent to ${result.email}`);
    } else {
      toast.info("Email not sent — copy the link and share it with the driver");
    }

    if (result.inviteLink) {
      try {
        await navigator.clipboard.writeText(result.inviteLink);
        setCopiedLink(driverId);
        setTimeout(() => setCopiedLink(null), 3000);
        toast.success("Invite link copied to clipboard");
      } catch {
        toast.message("Invite link", { description: result.inviteLink });
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
    if (error) return toast.error(error.message);

    if (form.vehicle_id) {
      await supabase.from("vehicles").update({ driver_id: driver.id }).eq("id", form.vehicle_id);
    }

    setOpen(false);
    setForm({ full_name: "", license_number: "", phone: "", email: "", vehicle_id: "" });
    qc.invalidateQueries({ queryKey: ["drivers"] });

    if (inviteAfterCreate) {
      await sendInvite(driver.id);
    } else {
      toast.success("Driver added. Click Invite to send login link.");
    }
  };

  const remove = async (id: string) => {
    await supabase.from("vehicles").update({ driver_id: null }).eq("driver_id", id);
    await supabase.from("drivers").delete().eq("id", id);
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

  const accountBadge = (d: any) => {
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
          <p className="text-sm text-muted-foreground">
            Add a driver, then invite by email. They set a password and open My Track. Link is copied for WhatsApp/SMS too.
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
                Send invite email immediately
              </label>
              <Button type="submit" className="w-full">
                Create {inviteAfterCreate ? "& invite" : ""}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
            {(data ?? []).map((d: any) => (
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
                  {(d.sms_logs?.length ?? 0)} sent
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
            {(data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No drivers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
