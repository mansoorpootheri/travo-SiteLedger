import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Role, type AppUser, type Site } from "@/lib/types";

interface AdminUserRow extends AppUser {
  sites: { id: string; name: string }[];
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => api.get<AdminUserRow[]>("/users") });
  const { data: sites } = useQuery({ queryKey: ["master-data", "/sites"], queryFn: () => api.get<Site[]>("/sites") });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; email: string; password: string; role: Role; siteIds: string[] }>({
    name: "",
    email: "",
    password: "",
    role: Role.ACCOUNTANT,
    siteIds: [],
  });

  function toggleSite(siteId: string) {
    setForm((f) => ({
      ...f,
      siteIds: f.siteIds.includes(siteId) ? f.siteIds.filter((id) => id !== siteId) : [...f.siteIds, siteId],
    }));
  }

  const createMutation = useMutation({
    mutationFn: () => api.post("/users", form),
    onSuccess: () => {
      toast.success("User created");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setOpen(false);
      setForm({ name: "", email: "", password: "", role: Role.ACCOUNTANT, siteIds: [] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Something went wrong"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patch(`/users/${id}`, { active }),
    onSuccess: (_data, variables) => {
      toast.success(variables.active ? "User reactivated" : "User deactivated");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Something went wrong"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Users</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Add User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New User</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Temporary password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(role) => setForm((f) => ({ ...f, role: role as Role }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={Role.ACCOUNTANT}>Accountant</SelectItem>
                    <SelectItem value={Role.SR_ACCOUNTANT}>Sr. Accountant</SelectItem>
                    <SelectItem value={Role.OWNER}>Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sites</Label>
                <p className="text-xs text-muted-foreground">Pick one or more. None selected = Owner spans all sites.</p>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-2">
                  {sites?.map((s) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`site-${s.id}`}
                        checked={form.siteIds.includes(s.id)}
                        onCheckedChange={() => toggleSite(s.id)}
                      />
                      <Label htmlFor={`site-${s.id}`} className="font-normal">
                        {s.name}
                      </Label>
                    </div>
                  ))}
                  {!sites?.length && <p className="text-sm text-muted-foreground">No sites yet.</p>}
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {users?.map((u) => (
              <TableRow key={u.id} className={!u.active ? "opacity-60" : undefined}>
                <TableCell>{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{u.role}</TableCell>
                <TableCell>{u.sites.length ? u.sites.map((s) => s.name).join(", ") : "—"}</TableCell>
                <TableCell>
                  <Badge variant={u.active ? "outline" : "secondary"}>{u.active ? "Active" : "Deactivated"}</Badge>
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={toggleActiveMutation.isPending}
                    onClick={() => toggleActiveMutation.mutate({ id: u.id, active: !u.active })}
                  >
                    {u.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
