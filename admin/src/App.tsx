import { useState } from "react";
import { type AdminPage } from "./app/navigation";
import { AdminLayout } from "./components/layout/admin-layout";

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
      <div className="placeholder-panel">
        <h2>{activePage}</h2>
        <p className="muted">Admin shell ready.</p>
      </div>
    </AdminLayout>
  );
}
