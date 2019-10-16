import { Dashboard } from "@mavenomics/dashboard";
import { IDirtyable } from "@mavenomics/coreutils";
import { IPlugin, Application } from "@phosphor/application";
import { Widget } from "@phosphor/widgets";

export interface IDashboardFrontend extends IDirtyable, Widget {
    dashboard: Dashboard;
    activeDashboard: string | null;
}

export type IDashboardPlugin<T = void> = IPlugin<Application<IDashboardFrontend>, T>;
