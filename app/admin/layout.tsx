import { AdminSidebar } from "./admin-sidebar";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="admin-route-shell"><AdminSidebar />{children}</div>;
}
