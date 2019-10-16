import { Dashboard } from "./Dashboard";
import { UUID } from "@phosphor/coreutils";
import { JSONObject, Converters } from "@mavenomics/coreutils";
import { LayoutSerializer, LayoutTypes } from "@mavenomics/layout";
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
