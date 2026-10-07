import { MasterDataPage } from "@/features/masterData/MasterDataPage";
import { useAppUser } from "@/routes/guards";
import { Role, type Customer } from "@/lib/types";

export default function CustomersPage() {
  const { user } = useAppUser();
  return (
    <MasterDataPage<Customer>
      title="Customers"
      endpoint="/customers"
      canWrite={user?.role === Role.ADMIN || user?.role === Role.SR_ACCOUNTANT || user?.role === Role.OWNER}
      columns={[
        { key: "name", label: "Name" },
        { key: "address", label: "Address" },
        { key: "phone", label: "Phone" },
        { key: "openingBalance", label: "Opening Balance", render: (row) => row.openingBalance ?? "—" },
      ]}
      fields={[
        { name: "name", label: "Name", type: "text" },
        { name: "address", label: "Address", type: "text" },
        { name: "phone", label: "Phone", type: "text" },
        { name: "openingBalance", label: "Opening Balance", type: "number", optional: true },
      ]}
    />
  );
}
