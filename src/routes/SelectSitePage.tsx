import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, type Location } from "react-router-dom";
import { api } from "@/lib/api";
import { today } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAppUser } from "@/routes/guards";
import { useSiteSelection } from "@/lib/site-context";
import { Role, type Site } from "@/lib/types";

export default function SelectSitePage() {
  const { user } = useAppUser();
  const { siteId: currentSiteId, date: currentDate, setSelection } = useSiteSelection();
  const { data: sites } = useQuery({ queryKey: ["master-data", "/sites"], queryFn: () => api.get<Site[]>("/sites") });
  const navigate = useNavigate();
  const location = useLocation();

  const [siteId, setSiteId] = useState(currentSiteId || user?.siteId || "");
  const [date, setDate] = useState(currentDate || today());
  const canManage = user?.role === Role.ADMIN || user?.role === Role.SR_ACCOUNTANT || user?.role === Role.OWNER;

  function handleNext() {
    setSelection(siteId, date);
    const from = (location.state as { from?: Location })?.from;
    navigate(from?.pathname ?? "/daybook", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Select Site &amp; Date</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Site</Label>
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select site" />
              </SelectTrigger>
              <SelectContent>
                {sites?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="select-site-date">Date</Label>
            <Input id="select-site-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Button className="w-full" disabled={!siteId || !date} onClick={handleNext}>
            Next
          </Button>
          {canManage && (
            <div className="flex justify-center gap-4 text-sm text-muted-foreground">
              <Link to="/master-data/sites" className="underline hover:text-foreground">
                Manage Master Data
              </Link>
              <Link to="/users" className="underline hover:text-foreground">
                Manage Users
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
