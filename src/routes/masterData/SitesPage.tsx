import { MasterDataPage } from "@/features/masterData/MasterDataPage";
import { useAppUser } from "@/routes/guards";
import { Role, type Site } from "@/lib/types";

export default function SitesPage() {
  const { user } = useAppUser();
  return (
    <MasterDataPage<Site>
      title="Sites"
      endpoint="/sites"
      canWrite={user?.role === Role.ADMIN || user?.role === Role.SR_ACCOUNTANT || user?.role === Role.OWNER}
      columns={[
        { key: "name", label: "Name" },
        { key: "address", label: "Address" },
      ]}
      fields={[
        { name: "name", label: "Name", type: "text" },
        { name: "address", label: "Address", type: "text" },
      ]}
    />
  );
}
