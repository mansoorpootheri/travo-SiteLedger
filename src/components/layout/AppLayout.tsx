import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "@/lib/auth-client";
import { useAppUser } from "@/routes/guards";
import { useSiteSelection } from "@/lib/site-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Role } from "@/lib/types";

const NAV_ITEMS: { to: string; label: string; roles: Role[] }[] = [
  { to: "/sales", label: "Sales", roles: [Role.ACCOUNTANT, Role.SR_ACCOUNTANT] },
  { to: "/purchases", label: "Purchases", roles: [Role.ACCOUNTANT, Role.SR_ACCOUNTANT] },
  { to: "/vouchers", label: "Vouchers", roles: [Role.ACCOUNTANT, Role.SR_ACCOUNTANT] },
  { to: "/journal-vouchers", label: "Journal", roles: [Role.SR_ACCOUNTANT, Role.OWNER] },
  { to: "/reports/sales", label: "Reports", roles: [Role.SR_ACCOUNTANT, Role.OWNER] },
  { to: "/master-data/sites", label: "Master Data", roles: [Role.SR_ACCOUNTANT, Role.OWNER] },
  { to: "/users", label: "Users", roles: [Role.SR_ACCOUNTANT, Role.OWNER] },
];

export default function AppLayout() {
  const { user } = useAppUser();
  const { date, clear: clearSiteSelection } = useSiteSelection();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2 font-semibold">
              <img src="/icon-192.png" alt="" className="h-6 w-6 rounded-md" />
              Entry
            </span>
            <nav className="flex gap-1">
              {/* ADMIN sees every item, same bypass as RequireRole/requireRole. */}
              {NAV_ITEMS.filter((item) => user.role === Role.ADMIN || item.roles.includes(user.role)).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted",
                      isActive && "bg-muted text-foreground",
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {user.name} · {user.role} · {date}
            </span>
            <Button variant="outline" size="sm" onClick={() => navigate("/select-site")}>
              Change site / date
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                clearSiteSelection();
                await signOut();
                navigate("/login");
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
