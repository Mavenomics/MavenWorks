import * as React from "react";
import { Type } from "@mavenomics/coreutils";
import { HoverManager } from "../hovers";
import { ReactWrapperWidget } from "../reactwidget";
import { Widget } from "@phosphor/widgets";
import { TypeEditorFactory } from "./factory";
import { ITypeEditorProps, isWidgetCtor, TypeEditorHost } from "./interfaces";

/**
 * A generic and extensible editor for working with Maven data types.
 *
 * @remarks
 *
 * Type editors are used extensively in MavenWorks, for editing everything
 * from layout properties to globals and part options. They are extensible, and
 * will display the most appropriate editor for the given type.
 *
 * To extend the TypeEditors, use the [ITypeEditorFactory].
 *
 */
export const TypeEditor: React.FC<TypeEditor.IProps> = (
    {type, value, onValueChanged, metadata, schema}
) => {
    const factory = TypeEditorFactory.Instance;
    const InlineEditor = factory.getEditor<unknown>(type);
    const ctx = React.useContext(TypeEditorHost.Context);

    const props = {
        type,
        value,
        metadata,
        schema,
        onValueChanged: (ch) => onValueChanged.call(void 0, ch)
    } as ITypeEditorProps<unknown>;

    function summonDetailEditor(ev: React.MouseEvent<HTMLButtonElement>) {
        const DetailEditor = factory.getDetailEditor<unknown>(type);
        let hover: Widget;
        if (isWidgetCtor(DetailEditor)) {
            hover = new DetailEditor(props);
        } else {
            hover = ReactWrapperWidget.Create(<DetailEditor {...props} />);
        }
        hover.title.label = hover.title.label || (type.name + " Editor");
        const manager = HoverManager.Instance!;
        manager.openHover({
            hover,
            mode: "dialog",
            height: 300,
            width: 300,
            owner: ctx.owner || new Widget(),
            x: ev.clientX,
            y: ev.clientY
        });
    }

    const button = factory.isDetailEditorSuppressed(type) ?
        null :
        (<button className="m-TypeEditor-DetailEditorBtn fa fa-ellipsis-h"
            onClick={(ev) => summonDetailEditor(ev)}></button>);

    return (
        <span className="m-TypeEditor">
            <InlineEditor {...props}/>
            {button}
        </span>
    );
};

export namespace TypeEditor {
    export interface IProps {
        type: Type;
        value: unknown;
        metadata?: Record<string, string>;
        // TODO: Replace this with a real schema interface if we ever implement
        // true validation
        schema?: {enum: string[]};
        onValueChanged: (this: void, newValue: unknown) => void;
    }
}
