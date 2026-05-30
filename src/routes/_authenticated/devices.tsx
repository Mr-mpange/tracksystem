import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/devices")({
  head: () => ({ meta: [{ title: "Devices — EcoTrack" }] }),
  component: DevicesPage,
});

function DevicesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [serial, setSerial] = useState(""); const [vehicleId, setVehicleId] = useState<string>("");

  const { data } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => (await supabase.from("devices").select("*, vehicles(plate_number)").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: vehicles } = useQuery({
    queryKey: ["vehicles-min"],
    queryFn: async () => (await supabase.from("vehicles").select("id,plate_number")).data ?? [],
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("devices").insert({ serial_number: serial, vehicle_id: vehicleId || null });
    if (error) return toast.error(error.message);
    toast.success("Device registered"); setOpen(false); setSerial(""); setVehicleId("");
    qc.invalidateQueries({ queryKey: ["devices"] });
  };
  const remove = async (id: string) => {
    await supabase.from("devices").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["devices"] });
  };

  const onlineCutoff = Date.now() - 5 * 60 * 1000;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-end justify-between">
        <div><h1 className="font-display text-3xl font-semibold">Devices</h1><p className="text-sm text-muted-foreground">IoT telemetry units.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Register device</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New device</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div className="space-y-2"><Label>Serial number</Label><Input required value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="ESP32_001" /></div>
              <div className="space-y-2"><Label>Assign to vehicle</Label>
                <Select value={vehicleId} onValueChange={setVehicleId}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>{(vehicles ?? []).map((v) => <SelectItem key={v.id} value={v.id}>{v.plate_number}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-3 text-left">Serial</th><th className="px-4 py-3 text-left">Vehicle</th><th className="px-4 py-3 text-left">Last seen</th><th className="px-4 py-3 text-left">Status</th><th></th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((d: any) => {
              const online = d.last_seen && new Date(d.last_seen).getTime() > onlineCutoff;
              return (
                <tr key={d.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{d.serial_number}</td>
                  <td className="px-4 py-3">{d.vehicles?.plate_number ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3 text-muted-foreground">{d.last_seen ? new Date(d.last_seen).toLocaleString() : "never"}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${online ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{online ? "online" : "offline"}</span></td>
                  <td className="px-4 py-3 text-right"><Button variant="ghost" size="icon" onClick={() => remove(d.id)}><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              );
            })}
            {(data?.length ?? 0) === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No devices registered.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
