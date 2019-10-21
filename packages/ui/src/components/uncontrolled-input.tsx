import * as React from "react";

interface InputProps {
    value: string;
    valueChanged: (this: void, val: string) => void;
    className?: string;
}

/**
 * # STOP!
 *
 * This input control is special, and should not be used for all circumstances.
 * It is uncontrolled, meaning it has hidden state that is not expressed in
 * it's properties. This control is meant to be used with fields that _should_
 * update in response to user input, but _may_ also update asynchronously.
 * Due to a spec bug in how browsers handle user state in input elements,
 * React cannot normally handle this case on it's own without stomping on user
 * context.
 *
 * Additionally, this control disables a number of browser features (like spell
 * check and autocomplete) so that it can remain performant on large strings.
 * If you _want_ these features, you'll need to use a different component.
 *
 * Use this component with ReactHelpers#useIntermediate.
 *
 * @example
 *
 * export function MyComponent({value, onValueChanged}) {
 *     const [val, key, setVal] = useIntermediate(value, onValueChanged);
 *     return (<UncontrolledInput key={key}
 *         value={val}
 *         onChange={newVal => setVal(newVal)}
 *     />);
 * }
 */
export const UncontrolledInput: React.FC<InputProps> = ({value, valueChanged, className}) => {
    // keep state internal
    const [val, setVal] = React.useState(value);

    // disable auto-* for performance reasons (inputs tend to blow up with
    // large strings when these are on)
    return (<input type="text"
        className={className}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        style={{width: "100%"}}
        value={val}
        onChange={(ev) => {
            setVal(ev.target.value);
            valueChanged.call(void 0, ev.target.value);
        }} />
    );
};
