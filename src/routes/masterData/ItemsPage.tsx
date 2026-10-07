import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MasterDataPage } from "@/features/masterData/MasterDataPage";
import { useAppUser } from "@/routes/guards";
import { api } from "@/lib/api";
import { Role, type Item, type Unit } from "@/lib/types";

export default function ItemsPage() {
  const { user } = useAppUser();
  const queryClient = useQueryClient();
  const { data: units } = useQuery({ queryKey: ["master-data", "/units"], queryFn: () => api.get<Unit[]>("/units") });

  // Lets the Unit field below create a brand-new unit inline (see
  // Combobox's `quickCreate`) instead of requiring a trip to the Units tab
  // first.
  async function createUnit(name: string) {
    const created = await api.post<Unit>("/units", { name });
    queryClient.invalidateQueries({ queryKey: ["master-data", "/units"] });
    return { value: created.id, label: created.name };
  }

  return (
    <MasterDataPage<Item>
      title="Items"
      endpoint="/items"
      canWrite={user?.role === Role.ADMIN || user?.role === Role.SR_ACCOUNTANT || user?.role === Role.OWNER}
      columns={[
        { key: "name", label: "Name" },
        { key: "unit", label: "Unit", render: (row) => row.unit?.name ?? "" },
      ]}
      fields={[
        { name: "name", label: "Name", type: "text" },
        {
          name: "unitId",
          label: "Unit",
          type: "select",
          // Inactive units can't be picked for a new Item — same reasoning
          // as User.active, "retired" master data instead of deleted.
          options: units?.filter((u) => u.isActive).map((u) => ({ value: u.id, label: u.name })) ?? [],
          quickCreate: { label: "Unit", onCreate: createUnit },
        },
      ]}
    />
  );
}
