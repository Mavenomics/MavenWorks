import { Token } from "@phosphor/coreutils";
import { Dashboard } from "@mavenomics/dashboard";

export interface IDashboardTracker {
    getCurrentDashboard(): Dashboard | null;
}

// dashboard-devtools consumers are expected to implement this
// TODO: Eventually this should become robust enough for DashboardActions
// to coalesce around
export const IDashboardTracker = new Token<IDashboardTracker>(
    "Dashboard Tracker"
);
