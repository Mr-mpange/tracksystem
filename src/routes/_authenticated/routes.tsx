import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Map as MapIcon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getFleetContext } from "@/lib/fleet-auth";
import {
  buildRouteDefaults,
  parseWaypointsText,
  waypointsToText,
  type Waypoint,
} from "@/lib/route-geo";
import { RouteDrawMap } from "@/components/RouteDrawMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/routes")({
  head: () => ({ meta: [{ title: "Routes — EcoTrack" }] }),
  beforeLoad: async () => {
    const ctx = await getFleetContext();
    if (!ctx.isAdmin) throw redirect({ to: "/my-track" });
  },
  component: RoutesPage,
});

const EMPTY_FORM = {
  name: "",
  description: "",
  waypoints: "",
  corridor_radius_m: "500",
};

function RoutesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState<Waypoint[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data } = useQuery({
    queryKey: ["routes"],
    queryFn: async () =>
      (await supabase.from("routes").select("*").order("name")).data ?? [],
  });

  const initAddRoute = () => {
    const defaults = buildRouteDefaults(data?.length ?? 0);
    setDrawnPoints(defaults.drawnPoints);
    setForm({
      name: defaults.name,
      description: defaults.description,
      waypoints: defaults.waypoints,
      corridor_radius_m: defaults.corridor_radius_m,
    });
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) initAddRoute();
    else {
      setDrawnPoints([]);
      setForm(EMPTY_FORM);
    }
  };

  const syncTextFromMap = (points: Waypoint[]) => {
    setDrawnPoints(points);
    setForm((f) => ({ ...f, waypoints: waypointsToText(points) }));
  };

  const syncMapFromText = (text: string) => {
    setForm((f) => ({ ...f, waypoints: text }));
    setDrawnPoints(parseWaypointsText(text));
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const waypoints = drawnPoints.length >= 2 ? drawnPoints : parseWaypointsText(form.waypoints);
    if (waypoints.length < 2) {
      return toast.error("Need at least 2 points — use Sample path or click the map");
    }

    const { error } = await supabase.from("routes").insert({
      name: form.name.trim(),
      description: form.description.trim() || null,
      waypoints: waypoints as unknown as Waypoint[],
      corridor_radius_m: parseInt(form.corridor_radius_m, 10) || 500,
    });

    if (error) return toast.error(error.message);
    toast.success("Route saved — assign it when scheduling a trip");
    handleOpenChange(false);
    qc.invalidateQueries({ queryKey: ["routes"] });
  };

  const remove = async (id: string) => {
    await supabase.from("routes").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["routes"] });
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2">
            <MapIcon className="h-7 w-7 text-primary" />
            Routes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Add route opens with a sample path you can edit or save. Click the map to change points.
          </p>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button onClick={() => initAddRoute()}>
              <Plus className="mr-2 h-4 w-4" />
              Add route
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Draw route on map</DialogTitle>
            </DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div className="space-y-2">
                <Label>Route name</Label>
                <Input
                  required
                  placeholder="e.g. Dar - Morogoro highway"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  placeholder="Main fleet corridor"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <RouteDrawMap
                waypoints={drawnPoints}
                onChange={syncTextFromMap}
                height="340px"
                onUseSample={initAddRoute}
              />

              <div className="space-y-2">
                <Label>Waypoints (auto-filled from map)</Label>
                <Textarea
                  rows={4}
                  className="font-mono text-xs"
                  value={form.waypoints}
                  onChange={(e) => syncMapFromText(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Edit by clicking the map, or paste coordinates here to replace the path.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Allowed distance from route (metres)</Label>
                <Input
                  type="number"
                  min={100}
                  max={5000}
                  value={form.corridor_radius_m}
                  onChange={(e) => setForm({ ...form, corridor_radius_m: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full">
                Save route
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
              <th className="px-4 py-3 text-left">Stops</th>
              <th className="px-4 py-3 text-left">Corridor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((r: any) => {
              const wps = (r.waypoints ?? []) as Waypoint[];
              return (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3">{wps.length} points</td>
                  <td className="px-4 py-3">{r.corridor_radius_m} m</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {(data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  No routes yet. Click <strong>Add route</strong> — form and map are filled automatically.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
