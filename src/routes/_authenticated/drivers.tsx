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

export const Route = createFileRoute("/_authenticated/drivers")({
  head: () => ({ meta: [{ title: "Drivers — EcoTrack" }] }),
  component: DriversPage,
});

function DriversPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", license_number: "", phone: "", email: "" });

  const { data } = useQuery({
    queryKey: ["drivers"],
    queryFn: async () => (await supabase.from("drivers").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("drivers").insert(form);
    if (error) return toast.error(error.message);
    toast.success("Driver added"); setOpen(false); setForm({ full_name: "", license_number: "", phone: "", email: "" });
    qc.invalidateQueries({ queryKey: ["drivers"] });
  };
  const remove = async (id: string) => {
    await supabase.from("drivers").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["drivers"] });
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-end justify-between">
        <div><h1 className="font-display text-3xl font-semibold">Drivers</h1><p className="text-sm text-muted-foreground">Fleet personnel.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Add driver</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New driver</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div className="space-y-2"><Label>Full name</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>License number</Label><Input value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <Button type="submit" className="w-full">Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">License</th><th className="px-4 py-3 text-left">Phone</th><th className="px-4 py-3 text-left">Email</th><th></th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((d) => (
              <tr key={d.id} className="border-t">
                <td className="px-4 py-3 font-medium">{d.full_name}</td>
                <td className="px-4 py-3">{d.license_number}</td>
                <td className="px-4 py-3">{d.phone}</td>
                <td className="px-4 py-3">{d.email}</td>
                <td className="px-4 py-3 text-right"><Button variant="ghost" size="icon" onClick={() => remove(d.id)}><Trash2 className="h-4 w-4" /></Button></td>
              </tr>
            ))}
            {(data?.length ?? 0) === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No drivers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
