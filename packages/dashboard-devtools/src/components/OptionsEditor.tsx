import * as React from "react";
import { Types, Converters, JSONObject, Type } from "@mavenomics/coreutils";
import { TypeEditor } from "@mavenomics/ui";

export class OptionsEditor extends React.Component<OptionsEditor.IProps, OptionsEditor.IState> {
    constructor(props: OptionsEditor.IProps) {
        super(props);
        this.state = {
            arguments: props.arguments,
            activeNameEditor: null,
            activeNameEditorIndex: null,
            newOptionName: null
        };
    }

    public render() {
        return (
            <div className="m-OptionsEditor">
                <div className="m-OptionsEditor-Header">
                    <span className="m-OptionsEditor-Field">Name</span>
                    <span className="m-OptionsEditor-Field">Type</span>
                    <span className="m-OptionsEditor-Field">Value</span>
                </div>
                <div className="m-OptionsEditor-Body">
                    {this.renderRows()}
                    {this.renderAddOptionRow()}
                </div>
            </div>
        );
    }

    public componentDidUpdate(_: any, prevState: OptionsEditor.IState) {
        if (prevState.arguments !== this.state.arguments) {
            this.props.onArgsChanged.call(void 0, this.state.arguments);
        }
    }

    private renderRows() {
        const rows = [];
        for (const optionIndex in this.state.arguments) {
            const option = this.state.arguments[optionIndex];
            rows.push(
                <div className="m-OptionsEditor-Row" key={option.name}>
                    <span className="m-OptionsEditor-Field m-OptionsEditor-NameField"
                          onDoubleClick={() => this.setActiveNameEditor(+optionIndex)}>
                        {+optionIndex === this.state.activeNameEditorIndex ? this.renderNameEditor() : option.name}
                    </span>
                    <span className="m-OptionsEditor-Field m-OptionsEditor-TypeField">
                        <select value={option.typeAnnotation}
                                onChange={(ev) => this.handleTypeFieldChanged(ev, +optionIndex)}>
                            {this.getTypesForOption(option)}
                        </select>
                    </span>
                    <span className="m-OptionsEditor-Field m-OptionsEditor-ValueField">
                        <TypeEditor type={Types.findType(option.typeAnnotation) || Types.Any}
                                    value={Converters.deserialize(option.defaultValue)}
                                    onValueChanged={(newVal) => this.handleValueChanged(newVal, +optionIndex)} />
                        <i className="m-OptionsEditor-icon fa fa-trash"
                           onClick={() => this.handleDeleteOption(+optionIndex)}></i>
                    </span>
                </div>
            );
        }
        return rows;
    }

    private setActiveNameEditor(optionIndex: number) {
        if (optionIndex === -1) {
            const oldIndex = this.state.activeNameEditorIndex!;
            const oldOption = this.state.arguments[oldIndex];
            this.setState({
                arguments: [
                    ...this.state.arguments.slice(0, oldIndex),
                    {
                        ...oldOption,
                        name: this.state.activeNameEditor,
                    } as OptionsEditor.ISerializedArgument,
                    ...this.state.arguments.slice(oldIndex + 1)
                ],
                activeNameEditor: null,
                activeNameEditorIndex: null
            });
            return;
        }
        const option = this.state.arguments[optionIndex];
        this.setState({
            activeNameEditor: option.name,
            activeNameEditorIndex: optionIndex
        });
    }

    private renderNameEditor() {
        return <input className="m-OptionsEditor-NameEditor"
                      type="text"
                      value={this.state.activeNameEditor!}
                      onChange={(ev) => this.setState({activeNameEditor: ev.target.value})}
                      onBlur={() => this.setActiveNameEditor(-1)} />;
    }

    private renderAddOptionRow() {
        return (
            <div className="m-OptionsEditor-Row">
                <i className="m-OptionsEditor-icon fa fa-plus" onClick={this.handleAddOption.bind(this)}></i>
                <input type="text"
                       value={this.state.newOptionName || ""}
                       onChange={(ev) => this.setState({newOptionName: ev.target.value})}
                       onBlur={() => {
                            if ((this.state.newOptionName || "") !== "") {
                                this.handleAddOption();
                            }
                        }} />
            </div>
        );
    }

    private getTypesForOption(option: OptionsEditor.ISerializedArgument) {
        // NOTE: This whole function is an ugly hack to work around a serious
        // bug in type serialization. The Serializer is implicitly expected to
        // _always_ return a JSON-serializable object, but for circular objects
        // (like Tables typed as Any), the serializer cannot uphold this
        // contract.
        // Filtering the types eliminates the most annoying surface for this
        // bug, minimizing it so that we can focus our energies elsewhere until
        // we revisit the types and serializers in a month or two. (Jul 22, '19)
        let types: Type[] = Types.registered;
        const badTypes = ["Any", "Object"];
        if (!badTypes.includes(option.typeAnnotation)) {
            types = types.filter(i => !badTypes.includes(i.serializableName));
        }
        return types.map(i => <option key={i.serializableName}>{i.serializableName}</option>);
    }

    private handleAddOption() {
        let newName = this.state.newOptionName || "";
        if (newName === "") {
            newName = "arg";
        }
        newName = this.findValidName(newName);
        this.setState({
            newOptionName: null,
            arguments: [
                ...this.state.arguments,
                {
                    name: newName,
                    typeAnnotation: "Any",
                    defaultValue: null,
                    metadata: null
                }
            ]
        });
    }

    private findValidName(name: string) {
        let newName = name;
        let combinator = 0;
        while (this.state.arguments.some(i => i.name === newName)) {
            newName = name + combinator++;
        }
        return newName;
    }

    private handleTypeFieldChanged(ev: React.ChangeEvent<HTMLSelectElement>, optionIndex: number) {
        const oldOption = this.state.arguments[optionIndex];
        this.setState({
            arguments: [
                ...this.state.arguments.slice(0, optionIndex),
                {
                    ...oldOption,
                    typeAnnotation: ev.target.value,
                },
                ...this.state.arguments.slice(optionIndex + 1)
            ]
        });
    }

    private handleValueChanged(newValue: any, optionIndex: number) {
        const oldOption = this.state.arguments[optionIndex];
        const optionType = Types.findType(oldOption.typeAnnotation) || Types.Any;
        const serializedVal = Converters.serialize(newValue, optionType);
        this.setState({
            arguments: [
                ...this.state.arguments.slice(0, optionIndex),
                {
                    ...oldOption,
                    defaultValue: serializedVal,
                },
                ...this.state.arguments.slice(optionIndex + 1)
            ]
        });
    }

    private handleDeleteOption(optionIndex: number) {
        this.setState({
            arguments: [
                ...this.state.arguments.slice(0, optionIndex),
                ...this.state.arguments.slice(optionIndex + 1)
            ]
        });
    }
}

export namespace OptionsEditor {
    export interface ISerializedArgument {
        name: string;
        typeAnnotation: string;
        metadata: unknown;
        defaultValue: JSONObject | null;
    }

    export interface IProps {
        arguments: ISerializedArgument[];
        onArgsChanged: (this: void, newArgs: ISerializedArgument[]) => void;
    }

    export interface IState {
        arguments: ISerializedArgument[];
        activeNameEditor: string | null;
        activeNameEditorIndex: number | null;
        newOptionName: string | null;
    }
}
