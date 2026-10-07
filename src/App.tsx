import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { RequireAuth, RequireRole, RequireSiteSelection, useAppUser } from "@/routes/guards";
import { Role } from "@/lib/types";
import Login from "@/routes/Login";
import SelectSitePage from "@/routes/SelectSitePage";
import SalesPage from "@/routes/transactions/SalesPage";
import PurchasesPage from "@/routes/transactions/PurchasesPage";
import VouchersPage from "@/routes/transactions/VouchersPage";
import JournalVouchersPage from "@/routes/transactions/JournalVouchersPage";
import UsersPage from "@/routes/UsersPage";
import MasterDataLayout from "@/routes/masterData/MasterDataLayout";
import SitesPage from "@/routes/masterData/SitesPage";
import UnitsPage from "@/routes/masterData/UnitsPage";
import ItemsPage from "@/routes/masterData/ItemsPage";
import GLAccountsPage from "@/routes/masterData/GLAccountsPage";
import CustomersPage from "@/routes/masterData/CustomersPage";
import VendorsPage from "@/routes/masterData/VendorsPage";
import ReportsLayout from "@/routes/reports/ReportsLayout";
import SalesRegisterPage from "@/routes/reports/SalesRegisterPage";
import PurchaseRegisterPage from "@/routes/reports/PurchaseRegisterPage";
import OutstandingPage from "@/routes/reports/OutstandingPage";
import TrialBalancePage from "@/routes/reports/TrialBalancePage";
import ProfitAndLossPage from "@/routes/reports/ProfitAndLossPage";
import BalanceSheetPage from "@/routes/reports/BalanceSheetPage";
import GlSummaryPage from "@/routes/reports/GlSummaryPage";
import BalanceTrendPage from "@/routes/reports/BalanceTrendPage";

// Vouchers/Sales/Purchases are Accountant/Sr. Accountant only; Owner's
// default landing is Reports instead, since Owner has no access to any of
// those three (mirrors RequireRole's own per-route role lists below).
function IndexRedirect() {
  const { user } = useAppUser();
  const to = user?.role === Role.OWNER ? "/reports" : "/vouchers";
  return <Navigate to={to} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/select-site"
        element={
          <RequireAuth>
            <SelectSitePage />
          </RequireAuth>
        }
      />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<IndexRedirect />} />

        <Route
          path="sales"
          element={
            <RequireSiteSelection>
              <RequireRole roles={[Role.ACCOUNTANT, Role.SR_ACCOUNTANT]}>
                <SalesPage />
              </RequireRole>
            </RequireSiteSelection>
          }
        />
        <Route
          path="purchases"
          element={
            <RequireSiteSelection>
              <RequireRole roles={[Role.ACCOUNTANT, Role.SR_ACCOUNTANT]}>
                <PurchasesPage />
              </RequireRole>
            </RequireSiteSelection>
          }
        />
        <Route
          path="vouchers"
          element={
            <RequireSiteSelection>
              <RequireRole roles={[Role.ACCOUNTANT, Role.SR_ACCOUNTANT]}>
                <VouchersPage />
              </RequireRole>
            </RequireSiteSelection>
          }
        />
        <Route
          path="journal-vouchers"
          element={
            <RequireSiteSelection>
              <RequireRole roles={[Role.SR_ACCOUNTANT, Role.OWNER]}>
                <JournalVouchersPage />
              </RequireRole>
            </RequireSiteSelection>
          }
        />
        <Route
          path="users"
          element={
            <RequireRole roles={[Role.SR_ACCOUNTANT, Role.OWNER]}>
              <UsersPage />
            </RequireRole>
          }
        />

        <Route
          path="master-data"
          element={
            <RequireRole roles={[Role.SR_ACCOUNTANT, Role.OWNER]}>
              <MasterDataLayout />
            </RequireRole>
          }
        >
          <Route index element={<Navigate to="sites" replace />} />
          <Route path="sites" element={<SitesPage />} />
          <Route path="units" element={<UnitsPage />} />
          <Route path="items" element={<ItemsPage />} />
          <Route path="gl-accounts" element={<GLAccountsPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="vendors" element={<VendorsPage />} />
        </Route>

        <Route
          path="reports"
          element={
            <RequireSiteSelection>
              <RequireRole roles={[Role.SR_ACCOUNTANT, Role.OWNER]}>
                <ReportsLayout />
              </RequireRole>
            </RequireSiteSelection>
          }
        >
          <Route index element={<Navigate to="sales" replace />} />
          <Route path="sales" element={<SalesRegisterPage />} />
          <Route path="purchases" element={<PurchaseRegisterPage />} />
          <Route path="outstanding" element={<OutstandingPage />} />
          <Route path="trial-balance" element={<TrialBalancePage />} />
          <Route path="profit-and-loss" element={<ProfitAndLossPage />} />
          <Route path="balance-sheet" element={<BalanceSheetPage />} />
          <Route path="gl-summary" element={<GlSummaryPage />} />
          <Route path="balance-trend" element={<BalanceTrendPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
