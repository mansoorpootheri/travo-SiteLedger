import { useQuery } from "@tanstack/react-query";
import { MasterDataPage } from "@/features/masterData/MasterDataPage";
import { useAppUser } from "@/routes/guards";
import { api } from "@/lib/api";
import { Role, type Supervisor, type Site } from "@/lib/types";

export default function SupervisorsPage() {
  const { user } = useAppUser();
  const { data: sites } = useQuery({ queryKey: ["master-data", "/sites"], queryFn: () => api.get<Site[]>("/sites") });

  return (
    <MasterDataPage<Supervisor>
      title="Supervisors"
      endpoint="/supervisors"
      canWrite={user?.role === Role.ADMIN || user?.role === Role.SR_ACCOUNTANT || user?.role === Role.OWNER}
      columns={[
        { key: "name", label: "Name" },
        { key: "code", label: "Code" },
        { key: "branchId", label: "Site", render: (row) => row.branchName ?? "—" },
        { key: "mobileNo", label: "Mobile", render: (row) => row.mobileNo ?? "—" },
      ]}
      fields={[
        { name: "name", label: "Name", type: "text" },
        { name: "code", label: "Code", type: "text" },
        {
          name: "branchId",
          label: "Site",
          type: "select",
          options: sites?.filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name })) ?? [],
        },
        { name: "mobileNo", label: "Mobile", type: "text", optional: true },
      ]}
    />
  );
}
