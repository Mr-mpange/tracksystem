import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Calendar, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getFleetContext } from "@/lib/fleet-auth";
import { apiJson } from "@/lib/remote-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/schedules")({
  head: () => ({ meta: [{ title: "Schedules — EcoTrack" }] }),
  beforeLoad: async () => {
    const ctx = await getFleetContext();
    if (!ctx.isAdmin) throw redirect({ to: "/my-track" });
  },
  component: SchedulesPage,
});

async function notifySchedule(scheduleId: string, type: "created" | "cancelled") {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  return apiJson("/api/schedules/notify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ scheduleId, type }),
  });
}

function RouteStatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    on_route: "default",
    off_route: "destructive",
    not_started: "secondary",
    completed: "outline",
  };
  const labels: Record<string, string> = {
    on_route: "On route",
    off_route: "Off route",
    not_started: "Not started",
    completed: "Done",
  };
  return (
    <Badge variant={variants[status] ?? "secondary"} className="text-[10px]">
      {labels[status] ?? status}
    </Badge>
  );
}

function SchedulesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [smsOnCreate, setSmsOnCreate] = useState(true);
  const [form, setForm] = useState({
    driver_id: "",
    route_id: "",
    title: "",
    description: "",
    location: "",
    scheduled_at: "",
  });

  const { data: routeList } = useQuery({
    queryKey: ["routes-list"],
    queryFn: async () => (await supabase.from("routes").select("id, name").order("name")).data ?? [],
  });

  const { data: drivers } = useQuery({
    queryKey: ["drivers-list"],
    queryFn: async () =>
      (await supabase.from("drivers").select("id, full_name, phone").order("full_name")).data ?? [],
  });

  const { data: schedules } = useQuery({
    queryKey: ["driver-schedules"],
    queryFn: async () =>
      (
        await supabase
          .from("driver_schedules")
          .select("*, drivers(full_name, phone), routes(name, corridor_radius_m)")
          .order("scheduled_at", { ascending: true })
      ).data ?? [],
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.driver_id || !form.title || !form.scheduled_at) {
      return toast.error("Driver, title, and date/time required");
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { data: schedule, error } = await supabase
      .from("driver_schedules")
      .insert({
        driver_id: form.driver_id,
        title: form.title,
        description: form.description || null,
        location: form.location || null,
        route_id: form.route_id || null,
        route_status: form.route_id ? "not_started" : "not_started",
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    if (error) return toast.error(error.message);

    if (smsOnCreate && schedule?.id) {
      const notify = await notifySchedule(schedule.id, "created");
      if (notify?.smsSent) {
        toast.success("Schedule saved & SMS sent to driver");
      } else if (notify?.error) {
        toast.success("Schedule saved");
        toast.warning(`SMS not sent: ${notify.error}`);
      } else {
        toast.success("Schedule saved");
      }
    } else {
      toast.success("Schedule saved");
    }

    setOpen(false);
    setForm({ driver_id: "", route_id: "", title: "", description: "", location: "", scheduled_at: "" });
    qc.invalidateQueries({ queryKey: ["driver-schedules"] });
  };

  const remove = async (id: string) => {
    await supabase.from("driver_schedules").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["driver-schedules"] });
  };

  const setStatus = async (id: string, status: "scheduled" | "completed" | "cancelled") => {
    await supabase.from("driver_schedules").update({ status }).eq("id", id);
    if (status === "cancelled") {
      const notify = await notifySchedule(id, "cancelled");
      if (notify?.smsSent) toast.info("Cancellation SMS sent to driver");
    }
    qc.invalidateQueries({ queryKey: ["driver-schedules"] });
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2">
            <Calendar className="h-7 w-7 text-primary" />
            Driver schedules
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Assign trips and notify drivers by SMS.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add schedule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New schedule</DialogTitle>
            </DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div className="space-y-2">
                <Label>Driver</Label>
                <Select value={form.driver_id} onValueChange={(v) => setForm({ ...form, driver_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select driver" />
                  </SelectTrigger>
                  <SelectContent>
                    {(drivers ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.full_name}
                        {!d.phone ? " (no phone)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assigned route</Label>
                <Select value={form.route_id} onValueChange={(v) => setForm({ ...form, route_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select route (recommended)" />
                  </SelectTrigger>
                  <SelectContent>
                    {(routeList ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  <Link to="/routes" className="text-primary hover:underline">Create routes</Link> first if none listed.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  required
                  placeholder="e.g. Dar es Salaam delivery"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Date & time</Label>
                <Input
                  required
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  placeholder="Depot, route, city"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={smsOnCreate} onCheckedChange={(v) => setSmsOnCreate(!!v)} />
                SMS driver via Africa&apos;s Talking
              </label>
              <Button type="submit" className="w-full">
                Save
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">When</th>
              <th className="px-4 py-3 text-left">Driver</th>
              <th className="px-4 py-3 text-left">Trip</th>
              <th className="px-4 py-3 text-left">Route</th>
              <th className="px-4 py-3 text-left">On route?</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(schedules ?? []).map((s: any) => (
              <tr key={s.id} className="border-t">
                <td className="px-4 py-3 whitespace-nowrap">{new Date(s.scheduled_at).toLocaleString()}</td>
                <td className="px-4 py-3">
                  {s.drivers?.full_name}
                  {!s.drivers?.phone && (
                    <span className="block text-xs text-destructive">No phone — SMS disabled</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{s.title}</div>
                  {s.location && <div className="text-xs text-muted-foreground">{s.location}</div>}
                </td>
                <td className="px-4 py-3 text-xs">{s.routes?.name ?? "—"}</td>
                <td className="px-4 py-3">
                  {s.route_id ? (
                    <RouteStatusBadge status={s.route_status} />
                  ) : (
                    <span className="text-xs text-muted-foreground">No route</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="secondary" className="capitalize">
                    {s.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right space-x-1">
                  {s.status === "scheduled" && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setStatus(s.id, "completed")}>
                        Done
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus(s.id, "cancelled")}>
                        Cancel
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => remove(s.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {(schedules?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No schedules yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
