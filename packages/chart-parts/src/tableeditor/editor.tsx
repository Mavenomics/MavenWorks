import * as React from "react";
import * as ReactDOM from "react-dom";
import { TypeEditor } from "@mavenomics/ui";
import { Type, Types, Converters } from "@mavenomics/coreutils";

export class SlickGridEditor<T extends Slick.SlickData>
    implements Slick.Editors.Editor<T>
//tslint:disable-next-line
{
    private args: Slick.Editors.EditorOptions<T>;
    private el: React.ReactElement | null = null;
    private newValue: any = null;
    private defaultValue: any = null;
    private didChange = false;
    private type: Type;

    constructor(args: Slick.Editors.EditorOptions<T>) {
        this.args = args;
        this.type = (this.args.column as Record<string, any>).type || Types.Any;
        this.defaultValue = (this.args.item || {} as Record<string, any>)[this.args.column.field!];
        this.newValue = this.defaultValue;
        this.renderEditor();
    }

    public init(): void {
        this.renderEditor();
    }

    public destroy(): void {
        // TODO: The typing on slickgrid is incorrect here, it's actually a
        // JQuery element
        ReactDOM.unmountComponentAtNode((this.args.container as any as JQuery)[0]);
    }

    public focus(): void {
        (this.args.container as any as JQuery)[0].focus();
    }

    public loadValue(item: any): void {
        this.defaultValue = item[this.args.column.field!];
        this.renderEditor();
    }

    public applyValue(item: any, state: string): void {
        item[this.args.column.field!] = Converters.deserialize(JSON.parse(state));
    }

    public isValueChanged(): boolean {
        return this.didChange;
    }

    public serializeValue() {
        return JSON.stringify(Converters.serialize(this.newValue, this.type));
    }

    public validate(): Slick.ValidateResults {
        return {
            valid: true,
            msg: ""
        };
    }

    private renderEditor() {
        // use the new value, if it's set. Otherwise use what's stored.
        const value = this.newValue;
        this.el = (<TypeEditor
            type={this.type}
            value={value}
            onValueChanged={(change) => {
                this.newValue = change;
                this.didChange = true;
                this.renderEditor();
            }}
        />);
        // TODO: The typing on slickgrid is incorrect here, it's actually a
        // JQuery element
        ReactDOM.render(this.el, (this.args.container as any as JQuery)[0], () => {
            const el = (this.args.container as any as JQuery).find("input");
            if (el.is(":focus")) {
                return;
            }
            el.focus();
        });
    }
}
