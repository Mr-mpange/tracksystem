import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Map as MapIcon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getFleetContext } from "@/lib/fleet-auth";
import { parseWaypointsText, waypointsToText, type Waypoint } from "@/lib/route-geo";
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

function RoutesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState<Waypoint[]>([]);
  const [form, setForm] = useState({
    name: "",
    description: "",
    waypoints: "",
    corridor_radius_m: "500",
  });

  const syncTextFromMap = (points: Waypoint[]) => {
    setDrawnPoints(points);
    setForm((f) => ({ ...f, waypoints: waypointsToText(points) }));
  };

  const syncMapFromText = (text: string) => {
    setForm((f) => ({ ...f, waypoints: text }));
    setDrawnPoints(parseWaypointsText(text));
  };

  const { data } = useQuery({
    queryKey: ["routes"],
    queryFn: async () =>
      (await supabase.from("routes").select("*").order("name")).data ?? [],
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const waypoints = drawnPoints.length >= 2 ? drawnPoints : parseWaypointsText(form.waypoints);
    if (waypoints.length < 2) {
      return toast.error("Draw or enter at least 2 points on the map");
    }

    const { error } = await supabase.from("routes").insert({
      name: form.name,
      description: form.description || null,
      waypoints: waypoints as unknown as Waypoint[],
      corridor_radius_m: parseInt(form.corridor_radius_m, 10) || 500,
    });

    if (error) return toast.error(error.message);
    toast.success("Route created — assign when scheduling a trip");
    setOpen(false);
    setDrawnPoints([]);
    setForm({ name: "", description: "", waypoints: "", corridor_radius_m: "500" });
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
            Click the map to draw a path. Drivers share GPS from their phone — no IoT device required.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
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
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>

              <RouteDrawMap waypoints={drawnPoints} onChange={syncTextFromMap} height="340px" />

              <div className="space-y-2">
                <Label>Waypoints (auto-filled from map, or paste manually)</Label>
                <Textarea
                  rows={4}
                  placeholder={"-6.7924, 39.2083\n-6.8234, 39.2695"}
                  value={form.waypoints}
                  onChange={(e) => syncMapFromText(e.target.value)}
                />
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
                  No routes yet. Click Add route and draw on the map.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
