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

export const Route = createFileRoute("/_authenticated/vehicles")({
  head: () => ({ meta: [{ title: "Vehicles — EcoTrack" }] }),
  component: VehiclesPage,
});

function VehiclesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [plate, setPlate] = useState(""); const [model, setModel] = useState("");
  const [fuelType, setFuelType] = useState<"gasoline" | "diesel">("gasoline");

  const { data } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => (await supabase.from("vehicles").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("vehicles").insert({ plate_number: plate, model, fuel_type: fuelType });
    if (error) return toast.error(error.message);
    toast.success("Vehicle added"); setOpen(false); setPlate(""); setModel("");
    qc.invalidateQueries({ queryKey: ["vehicles"] });
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["vehicles"] });
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Vehicles</h1>
          <p className="text-sm text-muted-foreground">Manage your fleet.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Add vehicle</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New vehicle</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-4">
              <div className="space-y-2"><Label>Plate number</Label><Input required value={plate} onChange={(e) => setPlate(e.target.value)} /></div>
              <div className="space-y-2"><Label>Model</Label><Input required value={model} onChange={(e) => setModel(e.target.value)} /></div>
              <div className="space-y-2"><Label>Fuel type</Label>
                <Select value={fuelType} onValueChange={(v) => setFuelType(v as "gasoline" | "diesel")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gasoline">Gasoline</SelectItem>
                    <SelectItem value="diesel">Diesel</SelectItem>
                  </SelectContent>
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
            <tr><th className="px-4 py-3 text-left">Plate</th><th className="px-4 py-3 text-left">Model</th><th className="px-4 py-3 text-left">Fuel</th><th className="px-4 py-3 text-left">Status</th><th></th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((v) => (
              <tr key={v.id} className="border-t">
                <td className="px-4 py-3 font-medium">{v.plate_number}</td>
                <td className="px-4 py-3">{v.model}</td>
                <td className="px-4 py-3 capitalize">{v.fuel_type}</td>
                <td className="px-4 py-3"><span className="inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary capitalize">{v.status}</span></td>
                <td className="px-4 py-3 text-right"><Button variant="ghost" size="icon" onClick={() => remove(v.id)}><Trash2 className="h-4 w-4" /></Button></td>
              </tr>
            ))}
            {(data?.length ?? 0) === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No vehicles yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
