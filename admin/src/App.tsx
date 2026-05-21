import { useState } from "react";
import { type AdminPage } from "./app/navigation";
import { AdminLayout } from "./components/layout/admin-layout";
import { SubscriptionsPage } from "./features/subscriptions/subscriptions-page";

export function App() {
  const [activePage, setActivePage] = useState<AdminPage>("subscriptions");
  const [search, setSearch] = useState("");

  return (
    <AdminLayout
      activePage={activePage}
      search={search}
      onSearchChange={setSearch}
      onNavigate={setActivePage}
    >
      {activePage === "subscriptions" ? (
        <SubscriptionsPage search={search} />
      ) : (
        <div className="placeholder-panel">
          <h2>{activePage}</h2>
          <p className="muted">Admin shell ready.</p>
        </div>
      )}
    </AdminLayout>
  );
}
