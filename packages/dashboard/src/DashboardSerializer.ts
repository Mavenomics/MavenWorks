import { Dashboard } from "./Dashboard";
import { UUID } from "@phosphor/coreutils";
import { JSONObject, Converters, IterTools } from "@mavenomics/coreutils";
import { LayoutSerializer, LayoutTypes, RegionWithChildren, WidgetLayoutRegion } from "@mavenomics/layout";
import { PartSerializer, JavascriptEvalPart } from "@mavenomics/parts";

export namespace DashboardSerializer {
    export function toJson(dashboard: Dashboard) {
        const {partManager, externalParts, layoutManager, globals} = dashboard;
        const parts: {[uuid: string]: any} = {};
        const metadata: {[uuid: string]: any} = {};
        for (const [uuid, part] of partManager) {
            parts[uuid] = {
                [PartSerializer.MIMETYPE]: PartSerializer.toJson(part, partManager.getBagById(uuid)!),
                "text/plain": "VisualEditorPart"
            };
        }
        if (externalParts != null) {
            for (const uuid of externalParts.getAllPartIds()) {
                const [model, partMetadata] = externalParts.serializePart(uuid);
                parts[uuid] = model;
                metadata[uuid] = partMetadata;
            }
        }
        const globalsModel = [];
        for (const global of globals) {
            const name = global.name;
            const type = global.type.serializableName;
            const serializedValue = Converters.serialize(global.value, global.type);
            globalsModel.push({
                name,
                type,
                value: serializedValue && serializedValue.value
            });
        }
        const layout = LayoutSerializer.toJson(layoutManager.root);
        return {
            layout,
            parts,
            metadata,
            globals: globalsModel,
            localParts: dashboard.localParts
        } as ISerializedDashboard;
    }

    /**
     * Given a Dashboard and a key to a particular layout region, generate a Dashboard model
     *
     * This model will be 'trimmed down' to just reference the parts that exist
     * in that subtree. All globals and local parts will be copied over
     * wholesale, without regard for whether or not they're referenced.
     *
     * The new model can be used as an independent dashboard, for things like
     * DashboardLink hovers.
     *
     * @export
     * @param dashboard The dashboard to serialize
     * @param newRootId A key referencing a "partial" subtree of the dashboard layout
     * @returns An independent Dashboard model
     */
    export function toJsonFromPartial(
        dashboard: Dashboard,
        newRootId: string
    ) {
        const { layoutManager } = dashboard;

        const region = layoutManager.getRegion(newRootId);

        if (region == null) {
            throw Error("Failed to create new dashboard from partial: Region not found: " + newRootId);
        }

        // generate a full model first, then trim it down
        const model = toJson(dashboard);

        const oldParts = model.parts;
        const oldMetadata = model.metadata;

        model.parts = {};
        model.metadata = oldMetadata == null ? void 0 : {};
        model.layout = LayoutSerializer.toJson(region);

        // force-show the region (since in many cases partials may be hidden
        // for cleanliness in the dashboard they come out of)
        model.layout.properties["showRegion"] = true;

        for (const subregion of IterTools.dfs_iter([region], i => (
            i instanceof RegionWithChildren
            ? i.widgets
            : void 0
        ))) {
            // skip any non-widgets
            if (!(subregion instanceof WidgetLayoutRegion)) continue;
            const guid = subregion.guid;
            // copy back the part def from the full model, since it's referenced
            model.parts[guid] = oldParts[guid];
            if (model.metadata && oldMetadata) {
                model.metadata[guid] = oldMetadata[guid];
            }
        }

        return model;
    }

    /**
     * A sensible default that represents an empty dashboard.
     */
    export const DEFAULT_DASHBOARD: ISerializedDashboard = {
        layout: {
            children: [],
            properties: {
                "flexSize": 1,
                "caption": "Dashboard"
            },
            typeName: LayoutTypes.StackPanelLayoutRegion,
            uuid: UUID.uuid4()
        } as LayoutSerializer.ISerializedStackPanel,
        metadata: {},
        parts: {},
        visual: true
    };

    /** The MIME type associated with serialzied dashboards */
    export const MAVEN_LAYOUT_MIME_TYPE = "application/vnd.maven.layout+json";

    /** A serialized dashboard model, as used by the notebook dashboards */
    export interface ISerializedDashboard {
        parts: {
            [guid: string]: {
                [mimeType: string]: any;
                [PartSerializer.MIMETYPE]?: PartSerializer.ISerializedPart
            }
        };
        metadata?: {
            [guid: string]: {
                [mimeType: string]: any;
            }
        };
        layout: LayoutSerializer.ISerializedLayoutRegion;
        dims?: { width: number, height: number };
        visual?: true;
        globals?: {name: string, type: string, value: unknown | JSONObject | null}[];
        localParts?: {[name: string]: JavascriptEvalPart.IUDPModel};
    }

    export interface IDashboardDocument extends DashboardSerializer.ISerializedDashboard {
        /** A script to run at startup for new kernels */
        init?: string[];
    }
}
