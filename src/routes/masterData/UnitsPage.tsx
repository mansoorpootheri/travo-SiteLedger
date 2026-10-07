import { MasterDataPage } from "@/features/masterData/MasterDataPage";
import { useAppUser } from "@/routes/guards";
import { Role, type Unit } from "@/lib/types";

export default function UnitsPage() {
  const { user } = useAppUser();
  return (
    <MasterDataPage<Unit>
      title="Units"
      endpoint="/units"
      canWrite={user?.role === Role.ADMIN || user?.role === Role.SR_ACCOUNTANT || user?.role === Role.OWNER}
      columns={[
        { key: "name", label: "Name" },
        { key: "narration", label: "Narration" },
      ]}
      fields={[
        { name: "name", label: "Name", type: "text" },
        { name: "narration", label: "Narration", type: "text", optional: true },
      ]}
    />
  );
}
