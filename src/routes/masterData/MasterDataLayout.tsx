import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/master-data/sites", label: "Sites" },
  { to: "/master-data/units", label: "Units" },
  { to: "/master-data/items", label: "Items" },
  { to: "/master-data/gl-accounts", label: "GL Accounts" },
  { to: "/master-data/customers", label: "Customers" },
  { to: "/master-data/vendors", label: "Vendors" },
];

export default function MasterDataLayout() {
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
