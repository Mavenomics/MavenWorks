import * as React from "react";
import { Part, OptionsBag } from "@mavenomics/parts";
import { IterTools, Converters } from "@mavenomics/coreutils";
import {
    WidgetLayoutRegion,
    DashboardLayoutRegion,
    RegionWithChildren,
} from "@mavenomics/layout";
import { Dashboard } from "@mavenomics/dashboard";
import { TypeEditor, PropertiesEditor, renderOnEmit } from "@mavenomics/ui";
import { AttachedProperty } from "@phosphor/properties";
import { PartPropertyEditor } from "../components";

function PartPropertiesEditor({region, dashboard}: RegionPropertiesEditor.IProps) {
    if (!(region instanceof WidgetLayoutRegion && region.content instanceof Part)) {
        return null;
    }
    const partId = region.content.uuid;
    const { partManager } = dashboard;
    const bag = partManager.getBagById(partId);
    const part = partManager.getPartById(partId);
    const bindings = partManager.bindings;
    if (bag == null || part == null) return null;
    const metadata = part.constructor.GetMetadata();
    function handleOptionChanged(newOpt: OptionsBag.PartOption) {
        if (bag == null || part == null) return null;
        partManager.setOptionForPart(part.uuid,
            newOpt.name,
            newOpt.binding || Converters.serialize(newOpt.value, newOpt.type));
    }
    const caption = part.getName();

    renderOnEmit(bag.OnOptionChanged);

    return (
        <React.Fragment>
            <h3>{caption} Properties</h3>
            {/* TODO: Move this into another component? Or, the individual editor*/}
            <PropertiesEditor
                key="editor"
                properties={[...IterTools.map(bag, i => {
                    const optMetadata = metadata.getMetadataForOption(i.name);
                    return [i.name, {
                        prettyName: i.name,
                        type: optMetadata!.type,
                        default: optMetadata!.value,
                        schema: optMetadata!.schema,
                        documentation: optMetadata!.description
                    }] as [string, PropertiesEditor.IPropertyMetadata];
                })]}
                renderEditor={(optionName: string, metadata: PropertiesEditor.IPropertyMetadata) => {
                    const opt = bag.getMetadata(optionName);
                    return <PartPropertyEditor
                        key={partId + optionName + opt.binding}
                        option={opt}
                        bindingsProv={bindings}
                        schema={metadata.schema}
                        onOptionChanged={handleOptionChanged} />;
                }}
            />
        </React.Fragment>
    );
}

function* getAllEditableProps(
    region: DashboardLayoutRegion<any>,
    metadata: DashboardLayoutRegion.Metadata<any>
): Iterable<[string, DashboardLayoutRegion.IPropertyMetadata]> {
    yield* metadata.getAllProperties() as Iterable<[string, DashboardLayoutRegion.IPropertyMetadata]>;
    if (region.parentRegion != null) {
        const parentMetadata = region.parentRegion.constructor.GetMetadata() as RegionWithChildren.ParentMetadata<any>;
        yield* parentMetadata.getAllAttachedProperties();
    }
}

/**
 * An editor for a particular layout region.
 */
export function RegionPropertiesEditor({region, dashboard, showLabel}: RegionPropertiesEditor.IProps) {
    if (region == null) {
        return <p>Select a layout region</p>;
    }
    const metadata = region.constructor.GetMetadata();
    let caption = region.getLayoutProperty("caption");
    if (region instanceof WidgetLayoutRegion) {
        caption = "Layout Region";
    } else if (caption === "" || caption === "New Region") {
        caption = region.constructor.name;
    }
    // TODO: Move this into something else
    function renderLayoutPropertyEditor(prop: string, metadata: PropertiesEditor.IPropertyMetadata) {
        if (region == null) {
            return null;
        }
        let isAttachedProp = false;
        let attachedProp: AttachedProperty<any, any> | undefined;
        if (region.parentRegion != null) {
            // test if prop is an attached prop
            const regionMetadata = (
                region.parentRegion.constructor.GetMetadata() as RegionWithChildren.ParentMetadata<any>
            );
            attachedProp = regionMetadata.getAttachedProperty(prop);
            if (attachedProp != null) {
                isAttachedProp = true;
            }
        }
        const value = isAttachedProp ? attachedProp!.get(region) : region.getLayoutProperty(prop as any);
        return (
            <TypeEditor type={metadata.type}
                key={region.id + "." + prop}
                value={value}
                schema={metadata.schema}
                onValueChanged={(newValue) => {
                    if (isAttachedProp) {
                        attachedProp!.set(region, newValue);
                        return;
                    }
                    region.setLayoutProperty(prop as any, newValue);
                }} />
        );
    }

    renderOnEmit(region.OnStale);

    return (
        <div className="m-RegionPropertiesEditor">
            {showLabel !== null && !showLabel ? null : (<h3>{caption} Properties</h3>)}
            <PropertiesEditor
                properties={[...getAllEditableProps(region, metadata)]}
                renderEditor={renderLayoutPropertyEditor}/>
            <PartPropertiesEditor region={region} dashboard={dashboard} />
        </div>
    );
}

export namespace RegionPropertiesEditor {
    export interface IProps {
        region: DashboardLayoutRegion | null;
        dashboard: Dashboard;
        showLabel?: boolean;
    }
}
