import * as React from "react";
import { Converters, Types } from "@mavenomics/coreutils";
import { OptionsBag } from "@mavenomics/parts";
import { BindingsProvider } from "@mavenomics/bindings";
import { TypeEditor } from "@mavenomics/ui";

export class PartPropertyEditor extends React.Component<PartPropertyEditor.IProps, PartPropertyEditor.IState> {
    constructor(props: PartPropertyEditor.IProps) {
        super(props);
        this.state = this.getStateFromOption();

    }

    public render() {
        let bindingOptions = this.props.bindingsProv.getBindingNames()
            .map(name => <option key={name} value={name}>{name}</option>);
        return <span className="m-PartProperty">
            {/* the any cast is to make TSC happy; it must be one of the Option values, but
                * TSC doesn't know that */}
            <select onChange={(ev) => this.changeBindingType(ev.target.value as any)}
                    defaultValue={this.state.bindingType || "None"}
                    className="m-PartProperty-BindingPicker">
                {bindingOptions}
            </select>
            <TypeEditor
                key={this.props.option.name + "." + this.state.bindingType}
                value={this.state.isBinding ? this.state.expression : this.props.option.value}
                type={this.state.isBinding ? Types.String : this.props.option.type}
                metadata={this.state.editorMetadata}
                onValueChanged={this.handleOptionChange.bind(this)}/>
        </span>;
    }

    private handleOptionChange(newValue: any) {
        const newState = {} as Partial<PartPropertyEditor.IState>;
        const newOption: OptionsBag.PartOption = {
            ...this.props.option,
            binding: undefined
        } as OptionsBag.PartOption;
        if (this.state.isBinding) {
            newState.expression = newValue;
            let prov = this.props.bindingsProv.getBindingEvaluator(this.state.bindingType);
            newOption.binding = {
                type: this.state.bindingType,
                expr: newState.expression,
                globals: prov.getGlobalsForBinding(newState.expression) //Parse the globals out of the expression
            } as any;
        } else {
            newState.serializedValue = JSON.stringify(Converters.serialize(newValue, newOption.type));
            newOption.value = newValue;
        }
        this.setState(newState as PartPropertyEditor.IState);
        this.props.onOptionChanged.call(void 0, newOption);
    }

    private changeBindingType(newType: string) {
        let newVal: any;
        let metadata: any;
        switch (newType) {
            case "None":
                newVal = null;
                break;
            default:
                newVal = {
                    type: newType,
                    globals: [],
                    expr: ""
                };
                const evaluator = this.props.bindingsProv.getBindingEvaluator(newType);
                const evalMeta = evaluator.getMetadata();
                metadata = evalMeta && { mime: evalMeta.editorMode };
        }
        this.setState({
            isBinding: newVal != null,
            bindingType: newType,
            expression: "",
            serializedValue: "",
            editorMetadata: metadata
        });
        this.props.onOptionChanged.call(void 0, {
            ...this.props.option,
            binding: newVal
        });
    }

    private getStateFromOption(): PartPropertyEditor.IState {
        const option = this.props.option;
        const newState: Partial<PartPropertyEditor.IState> = {
            isBinding: option.binding != null,
        };
        if (newState.isBinding) {
            const binding = option.binding as OptionsBag.Binding;
            // TODO: support for callback bindings
            newState.bindingType = binding.type;
            newState.expression = binding.expr;
            const evaluator = this.props.bindingsProv.getBindingEvaluator(binding.type);
            const evalMeta = evaluator.getMetadata();
            newState.editorMetadata = (evalMeta && { mime: evalMeta.editorMode }) || undefined;
        } else {
            newState.serializedValue = JSON.stringify(Converters.serialize(option.value, option.type));
        }
        // typescript has trouble resolving the difference between Pick<type, partial list of keys>
        // and Partial<type>, hence the cast
        return newState as PartPropertyEditor.IState;
    }
}

export namespace PartPropertyEditor {
    export interface IState {
        isBinding: boolean;
        bindingType: string;
        expression: string | undefined;
        serializedValue: string | undefined;
        editorMetadata?: {mime: string};
    }

    export interface IProps {
        option: OptionsBag.PartOption;
        bindingsProv: BindingsProvider;
        onOptionChanged: (this: void, opt: OptionsBag.PartOption) => void;

    }
}
