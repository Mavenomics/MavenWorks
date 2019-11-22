import { IUrlManager, IConfigManager } from "@mavenomics/apputils";
import { DashboardSerializer, Dashboard } from "@mavenomics/dashboard";
import { deserialize } from "@mavenomics/coreutils";
import { Widget } from "@phosphor/widgets";

export const enum DashboardSrc {
    Config = "config",
    Url = "src:url",
}

export interface IDashboardLink {
    type: "DashboardLink";
    name: string;
    path: string;
    src: DashboardSrc;
    width: number;
    height: number;
    overrides: Record<string, any>;
}

export function isDashboardLink(t: unknown): t is IDashboardLink {
    return (
        typeof t === "object"
        && t != null
        && t.hasOwnProperty("type")
        && Reflect.get(t, "type") === "DashboardLink"
    );
}

export async function makeDashboardLink(
    cell: unknown,
    dashboardOpts: Dashboard.IOptions,
    urlManager?: IUrlManager,
    configManager?: IConfigManager,
): Promise<{hover: Widget, width: number, height: number}> {
    if (!isDashboardLink(cell)) throw Error("Not a DashboardLink cell!");

    const { name, path, src, width, height, overrides } = cell;

    let model: DashboardSerializer.ISerializedDashboard | null = null;

    switch (src) {
        case DashboardSrc.Config:
            if (configManager == null) {
                throw Error("Cannot create Dashboard Link: No ConfigManager provided to resolve config link");
            }
            model = await configManager.getDashboard(path);
            break;
        case DashboardSrc.Url:
            if (urlManager == null) {
                throw Error("Cannot create Dashboard Link: No UrlManager provided to resolve src:url link");
            }
            const url = urlManager.resolveSrcUrl(path);
            const data = await fetch(url);
            if (!data.ok) throw Error(`Fetch Error: ${data.status} ${data.statusText}`);
            model = await data.json();
            break;
        default:
            throw Error("Unsupported source: " + src);
    }

    if (model == null) {
        throw Error("Failed to load model");
    }

    const globalOverrides: Record<string, any> = {};

    for (const [key, value] of Object.entries(overrides)) {
        globalOverrides[key] = deserialize(value);
    }

    const dashboard = new Dashboard({ ...dashboardOpts });

    dashboard.title.label = name;
    // leave this to finish asynchronously
    dashboard.loadFromModelWithOverrides(
        model,
        overrides
    );

    return {
        width,
        height,
        hover: dashboard
    };
}
