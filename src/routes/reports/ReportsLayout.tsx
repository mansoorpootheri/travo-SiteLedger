import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/reports/sales", label: "Sales Register" },
  { to: "/reports/purchases", label: "Purchase Register" },
  { to: "/reports/outstanding", label: "Outstanding" },
  { to: "/reports/trial-balance", label: "Trial Balance" },
  { to: "/reports/profit-and-loss", label: "P&L" },
  { to: "/reports/balance-sheet", label: "Balance Sheet" },
  { to: "/reports/gl-summary", label: "G/L Summary" },
  { to: "/reports/balance-trend", label: "Balance Trend" },
];

export default function ReportsLayout() {
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground",
                isActive && "border-foreground text-foreground",
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
