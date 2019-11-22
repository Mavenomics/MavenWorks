/** A collection of helpers for parts needing Table Formatting */

/**
 * An interface representing a link to another dashboard.
 *
 * To create a hoverable link from this object, use {@link PartServices.dashboardLinker}
 *
 * @export
 * @interface IDashboardLink
 */
export interface IDashboardLink {
    type: "DashboardLink";
    name: string;
    path: string;
    src: IDashboardLink.DashboardSrc;
    width: number;
    height: number;
    overrides: Record<string, any>;
}

export namespace IDashboardLink {
    export const enum DashboardSrc {
        Config = "config",
        Url = "url",
        Embed = "dashboard"
    }

    export function isDashboardLink(t: unknown): t is IDashboardLink {
        return (
            typeof t === "object"
            && t != null
            && t.hasOwnProperty("type")
            && Reflect.get(t, "type") === "DashboardLink"
        );
    }
}



