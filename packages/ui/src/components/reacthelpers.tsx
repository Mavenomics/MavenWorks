import * as React from "react";
import { Observable } from "rxjs";

/**
 * Helper function for imperatively rerendering a function component.
 *
 * @example
 *
 *  function MyReactComponent({onDirty}: {onDirty: Observable<void>}) {
 *      const forceRender = useRender();
 *
 *      setTimeout(() => forceRender(), 1000)
 *
 *      return (<span>Hello, world! {Date.now()}</span>);
 *  }
 */
export function useRender(this: void) {
    const [_rand, setRand] = React.useState(0);

    return function forceRender() {
        setRand(Math.random());
    };
}

/**
 * Helper function to fetch the previous value of a hook, for comparison
 *
 * @export
 * @template T The type of the value to remember
 * @param this
 * @param value The value to remember
 * @returns The previous value given to this hook, or undefined.
 *
 * @example
 *
 * function MyComponent() {
 *     const [val, setVal] = React.useHook(true);
 *     const lastVal = usePrevious(val);
 *
 *     return (<button onClick={() => setVal(!val)}>
 *         WAS: {lastVal}. NOW: {val}
 *     </button>);
 * }
 */
export function usePrevious<T>(this: void, value: T): T | undefined {
    const ref = React.useRef<T>();
    React.useEffect(() => {
        ref.current = value;
    }, [ref, value]);
    return ref.current;
}

/**
 * Rerender a react component whenever an observable emits.
 *
 * This is useful for components that use Observables as a dirtiness signal,
 * such as the TreeView.
 */
export function renderOnEmit(this: void, obs: Observable<any>) {
    const render = useRender();
    React.useEffect(() => {
        const sub = obs.subscribe(() => render());
        return () => sub.unsubscribe();
    }, [obs]);
}
