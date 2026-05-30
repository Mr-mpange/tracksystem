import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Link2, MessageSquare, KeyRound, AlertCircle } from "lucide-react";
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
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordDriver, setPasswordDriver] = useState<DriverRow | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [createLoginOnAdd, setCreateLoginOnAdd] = useState(true);
  const [newDriverPassword, setNewDriverPassword] = useState("");
  const [form, setForm] = useState({
    full_name: "",
    license_number: "",
    phone: "",
    email: "",
    vehicle_id: "",
  });

  const loginUrl = `${siteBaseUrl()}/login`;

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
        .select(
          "id, full_name, phone, email, license_number, vehicle_id, user_id, invited_at, created_at, vehicles!drivers_vehicle_id_fkey(plate_number)"
        )
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

  const setDriverPassword = async (driverId: string, pwd: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return toast.error("You must be signed in");

    const result = await apiJson<{
      ok: boolean;
      error?: string;
      email?: string;
      loginUrl?: string;
      message?: string;
    }>("/api/drivers/set-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ driverId, password: pwd }),
    });

    if (!result.ok) {
      toast.error(result.error ?? "Failed to set password");
      return false;
    }

    qc.invalidateQueries({ queryKey: ["drivers"] });
    toast.success(
      `Login ready for ${result.email}. Share the password by phone/SMS. Sign in at: ${result.loginUrl ?? loginUrl}`,
      { duration: 10000 }
    );
    return true;
  };

  const openPasswordDialog = (driver: DriverRow) => {
    setPasswordDriver(driver);
    setPassword("");
    setPasswordConfirm("");
    setPasswordOpen(true);
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordDriver) return;
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    if (password !== passwordConfirm) return toast.error("Passwords do not match");

    setSavingPassword(true);
    try {
      const ok = await setDriverPassword(passwordDriver.id, password);
      if (ok) {
        setPasswordOpen(false);
        setPasswordDriver(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set password");
    } finally {
      setSavingPassword(false);
    }
  };

  const sendEmailInvite = async (driverId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return toast.error("You must be signed in");

    try {
      const result = await apiJson<{
        ok: boolean;
        error?: string;
        emailSent?: boolean;
        emailError?: string | null;
      }>("/api/drivers/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ driverId, siteUrl: siteBaseUrl(), sendEmail: true }),
      });

      if (!result.ok) return toast.error(result.error ?? "Invite failed");
      if (result.emailSent) {
        toast.success("Invite email sent (requires SMTP in Supabase → Authentication → Email)");
      } else {
        toast.error(result.emailError ?? "Email not sent. Use Set password instead.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email?.trim()) return toast.error("Email required for login");
    if (!form.phone?.trim()) return toast.error("Phone required for SMS alerts");
    if (createLoginOnAdd && newDriverPassword.length < 6) {
      return toast.error("Set a password (min 6 characters) or uncheck Create login now");
    }

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
          "Permission denied — your account needs super_admin or fleet_manager role."
        );
      }
      return toast.error(error.message);
    }

    if (form.vehicle_id) {
      await supabase.from("vehicles").update({ driver_id: driver.id }).eq("id", form.vehicle_id);
    }

    if (createLoginOnAdd) {
      const ok = await setDriverPassword(driver.id, newDriverPassword);
      if (!ok) return;
    }

    setOpen(false);
    setForm({ full_name: "", license_number: "", phone: "", email: "", vehicle_id: "" });
    setNewDriverPassword("");
    await qc.invalidateQueries({ queryKey: ["drivers"] });
    if (!createLoginOnAdd) toast.success("Driver saved — click Set password when ready");
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
          Can sign in
        </Badge>
      );
    }
    return <span className="text-xs text-muted-foreground">No login yet</span>;
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Drivers</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Set a password for each driver — no email needed. They sign in at{" "}
            <a href={loginUrl} className="text-primary underline" target="_blank" rel="noreferrer">
              {loginUrl}
            </a>{" "}
            with their email + password. Tell them the password by phone or SMS.
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
                <Label>Email (login)</Label>
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
                  checked={createLoginOnAdd}
                  onChange={(e) => setCreateLoginOnAdd(e.target.checked)}
                />
                Create login now (set password)
              </label>
              {createLoginOnAdd && (
                <div className="space-y-2">
                  <Label>Password for driver</Label>
                  <Input
                    type="password"
                    required
                    minLength={6}
                    placeholder="Min 6 characters"
                    value={newDriverPassword}
                    onChange={(e) => setNewDriverPassword(e.target.value)}
                  />
                </div>
              )}
              <Button type="submit" className="w-full">
                Save driver
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Alert>
        <KeyRound className="h-4 w-4" />
        <AlertTitle>Email invites optional</AlertTitle>
        <AlertDescription className="text-sm">
          Supabase free email hits rate limits quickly. Use <strong>Set password</strong> instead.
          To send real invite emails later: Supabase Dashboard → Authentication → Email → Custom SMTP,
          and set Site URL to <code className="text-xs bg-muted px-1 rounded">{siteBaseUrl()}</code>.
        </AlertDescription>
      </Alert>

      {loadError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load drivers</AlertTitle>
          <AlertDescription>{loadError.message}</AlertDescription>
        </Alert>
      )}

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set driver password</DialogTitle>
          </DialogHeader>
          {passwordDriver && (
            <form onSubmit={submitPassword} className="space-y-3">
              <p className="text-sm text-muted-foreground">
                <strong>{passwordDriver.full_name}</strong> will sign in with{" "}
                <strong>{passwordDriver.email}</strong>
              </p>
              <div className="space-y-2">
                <Label>New password</Label>
                <Input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Confirm password</Label>
                <Input
                  type="password"
                  required
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={savingPassword}>
                {savingPassword ? "Saving…" : "Save password"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

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
                    <div className="flex justify-end gap-1 flex-wrap">
                      <Button size="sm" variant="default" onClick={() => openPasswordDialog(d)}>
                        <KeyRound className="h-3 w-3 mr-1" />
                        {d.user_id ? "Reset password" : "Set password"}
                      </Button>
                      {!d.user_id && (
                        <Button size="sm" variant="ghost" onClick={() => sendEmailInvite(d.id)} title="Optional — needs SMTP">
                          Email invite
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
