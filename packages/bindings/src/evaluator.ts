import { IDisposable } from "@phosphor/disposable";

/**
 * An interface for something that evaluates arbitrary expressions.
 *
 * This is distinct from the bindings in that IExpressionEvaluators can
 * independently evaluate an expression (such as sending it to a Jupyter kernel).
 *
 * TODO: What is the long-term future of these? I feel like it'd be better to
 * ask the framework to evaluate another expresion arbitrarily, but kernel
 * expressions are 'special' enough to warrant design considerations.
 *
 * @export
 * @interface IExpressionEvaluator
 */
export interface IExpressionEvaluator extends IDisposable {
    evaluate(expression: string, globals: ReadonlyArray<string>): Promise<unknown>;
    getMetadata(): void | { editorMode: string };
}
