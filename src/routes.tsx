import { lazy, Suspense } from "react";
import { Link, Route, Routes, Navigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Empty } from "./components/common";

// Pages are loaded on demand; the shell and shared components ship in the entry bundle.
const StorePage = lazy(() =>
  import("./pages/Store").then((m) => ({ default: m.StorePage })),
);
const ActorPage = lazy(() =>
  import("./pages/actor/ActorPage").then((m) => ({ default: m.ActorPage })),
);
const Dashboard = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })),
);
const Runs = lazy(() =>
  import("./pages/Runs").then((m) => ({ default: m.Runs })),
);
const RunDetail = lazy(() =>
  import("./pages/RunDetail").then((m) => ({ default: m.RunDetail })),
);
const Tasks = lazy(() =>
  import("./pages/Tasks").then((m) => ({ default: m.Tasks })),
);
const Schedules = lazy(() =>
  import("./pages/Schedules").then((m) => ({ default: m.Schedules })),
);
const Storage = lazy(() =>
  import("./pages/Storage").then((m) => ({ default: m.Storage })),
);
const Integrations = lazy(() =>
  import("./pages/Integrations").then((m) => ({ default: m.Integrations })),
);
const SettingsPage = lazy(() =>
  import("./pages/Settings").then((m) => ({ default: m.SettingsPage })),
);
const Billing = lazy(() =>
  import("./pages/Billing").then((m) => ({ default: m.Billing })),
);
const Information = lazy(() =>
  import("./pages/Information").then((m) => ({ default: m.Information })),
);
const GettingStarted = lazy(() =>
  import("./pages/GettingStarted").then((m) => ({ default: m.GettingStarted })),
);

export function AppRoutes({
  workspace,
  setWorkspace,
}: {
  workspace: { name: string } | null;
  setWorkspace: (workspace: { name: string }) => void;
}) {
  return (
    <Suspense fallback={<Empty title="Loading" text="Opening this page…" />}>
      <Routes>
        <Route path="/store" element={<StorePage />} />
        <Route path="/actors/:id" element={<ActorPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/actors" element={<StorePage mine />} />
        <Route path="/runs" element={<Runs />} />
        <Route path="/runs/:id" element={<RunDetail />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/schedules" element={<Schedules />} />
        <Route path="/storage" element={<Storage />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route
          path="/settings"
          element={
            <SettingsPage workspace={workspace} setWorkspace={setWorkspace} />
          }
        />
        <Route path="/billing" element={<Billing />} />
        <Route path="/insights" element={<Dashboard insights />} />
        <Route path="/proxy" element={<Information kind="proxy" />} />
        <Route path="/messaging" element={<Information kind="messaging" />} />
        <Route path="/getting-started" element={<GettingStarted />} />
        {/* Former account pages: the workspace needs no sign-in. */}
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        <Route path="/signup" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="*"
          element={
            <Empty
              icon={Search}
              title="Page not found"
              text="This page does not exist."
              action={
                <Link className="btn primary" to="/store">
                  Go to the store
                </Link>
              }
            />
          }
        />
      </Routes>
    </Suspense>
  );
}
