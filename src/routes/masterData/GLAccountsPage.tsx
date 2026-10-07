import { useQuery } from "@tanstack/react-query";
import { MasterDataPage } from "@/features/masterData/MasterDataPage";
import { useAppUser } from "@/routes/guards";
import { Role, type GLAccount } from "@/lib/types";
import { getAccountHeaders } from "@/lib/dotnet-shim";

export default function GLAccountsPage() {
  const { user } = useAppUser();
  // The "Group" a new GL Account is created under is a dynamic,
  // tenant-specific list (AccountMaster/GetHeaders), not a fixed enum — see
  // dotnet-shim.ts's note on reshapeAccountMaster.
  const { data: headers } = useQuery({ queryKey: ["gl-account-headers"], queryFn: getAccountHeaders });
  const headerOptions = headers?.map((h) => ({ value: h.id, label: h.name })) ?? [];

  return (
    <MasterDataPage<GLAccount>
      title="GL Accounts"
      endpoint="/gl-accounts"
      canWrite={user?.role === Role.ADMIN || user?.role === Role.SR_ACCOUNTANT || user?.role === Role.OWNER}
      columns={[
        { key: "name", label: "Name" },
        { key: "headerName", label: "Group", render: (row) => row.headerName ?? "—" },
        { key: "openingBalance", label: "Opening Balance", render: (row) => row.openingBalance ?? "—" },
      ]}
      fields={[
        { name: "headerId", label: "Group", type: "select", options: headerOptions },
        { name: "name", label: "Account Name", type: "text" },
        { name: "openingBalance", label: "Opening Balance", type: "number", optional: true },
      ]}
    />
  );
}
