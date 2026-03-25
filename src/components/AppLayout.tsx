import { Outlet } from "react-router-dom";
import { AppHeader } from "./AppHeader";

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
