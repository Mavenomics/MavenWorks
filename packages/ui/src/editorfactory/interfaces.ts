import { Type } from "@mavenomics/coreutils";
import * as React from "react";
import { Widget } from "@phosphor/widgets";

/**
 * A fully controlled React component for editing a given value.
 *
 * Type editors are passed through the EditorFactory, and are used extensively
 * by the framework for a consistent, cohesive, and comprehensive editing UX.
 * These are usually managed by a <TypeEditor> component, and aren't normally
 * consumed directly by user code.
 *
 * @interface
 */
export type ITypeEditorConstructor<T> = {
    new(props: ITypeEditorProps<T>, ...args: any[]): React.Component<T, unknown>
} | React.FunctionComponent<ITypeEditorProps<T>>;

/**
 * A fully controlled React component, or a Widget, for editing a given value.
 *
 * Such editors appear in larger UI elements, such as popups or pinned tooltips,
 * and are suitable for comprehensively editing a particular value.
 *
 * They do not have to be React components- a Widget also works as a detail
 * editor.
 *
 * @interface
 */
export type IDetailEditorConstructor<T> = {
    new(props: ITypeEditorProps<T>, ...args: any[]): Widget;
} | ITypeEditorConstructor<T>;

export function isWidgetCtor<T>(ctor: IDetailEditorConstructor<T>): ctor is {
    new(props: ITypeEditorProps<T>, ...args: any[]): Widget
} {
    return ctor.prototype instanceof Widget;
}

export interface ITypeEditorProps<T> {
    /**
     * The type of the value being edited.
     *
     * The Type must be constant over the lifecycle of the component- this is
     * guaranteed by the <TypeEditor>, but other parent components must manage
     * this directly.
     */
    readonly type: Type;

    /**
     * The value to be edited.
     */
    readonly value: T;

    /**
     * A key-value map of metadata to send to the type editor.
     *
     * This metadata is optional, and may be used to describe things like syntax
     * highlighting mode.
     */
    readonly metadata?: Record<string, string>;

    /**
     * A callback for when the value being edited should change.
     *
     * Note: This should only emit with valid values of `T`.
     */
    readonly onValueChanged: (this: void, newValue: T) => void;

    /**
     * A schema for validating edited values with.
     *
     * NOTE: Only used by Strings right now, not useful for anything else.
     */
    readonly schema?: { enum: string[] };
}

export interface ITypeEditorFactory {
    /**
     * Retrieve an inline editor component from the factory
     *
     * @template T The type of the value to be edited
     * @param type The type annotation of the value to be edited
     */
    getEditor<T>(type: Type): ITypeEditorConstructor<T>;

    /**
     * Retrieve a detailed popup editor from the factory.
     *
     * Popup editors should display more context, and expose more "knobs", than
     * an inline editor. They are given more screen real estate and are
     * displayed as first-class browser popups.
     *
     * @template T The type of the value to be edited
     * @param type The type annotation of the value to be edited
     */
    getDetailEditor<T>(type: Type): IDetailEditorConstructor<T>;

    /**
     * Whether the detail editor for a given type should be shown.
     *
     * For some types, detail editors don't really make sense, since the type
     * is too simple to ever warrant needing a popup. Type editors should not
     * display a triple-dot in these cases.
     *
     * @param type The type annotation of the editor
     * @returns Whether the detail editor button should be elided
     */
    isDetailEditorSuppressed(type: Type): boolean;

    /**
     * Register an inline editor, associating it with a given type annotation
     *
     * @template T The type of the value that this editor works with
     * @param type The annotation to associate with in the factory
     * @param editor A constructor for a type editor
     */
    registerEditor<T>(type: Type, editor: ITypeEditorConstructor<T>): void;

    /**
     * Register a detailed editor, associating it with a given type annotation
     *
     * @template T The type of the value that this editor works with
     * @param type The annotation to associate with in the factory
     * @param editor A constructor for a type editor
     */
    registerDetailEditor<T>(type: Type, editor: IDetailEditorConstructor<T>): void;

    /**
     * Supress a detail editor for a given type. Some types are simple enough
     * that they don't need a detail editor, such as Booleans, Dates,
     * and Numbers. These types are primitive enough that the existence of a
     * detail editor isn't helpful, and just acts as clutter.
     *
     * @param type The type of the editor to supress
     */
    suppressDetailEditor(type: Type): void;
}

/** Namespace for statics relating to consumers of TypeEditors. */
export namespace TypeEditorHost {
    export interface IContext {
        /** Where type editors should display UI elements like tooltips. */
        portalHostNode?: HTMLElement;
        /** A Widget that should be used as the Owner of any spawned hovers. */
        owner?: Widget;
    }

    /** Context object for type editor hosts to attach metadata.
     *
     * @remarks
     *
     * Some editors need things like information on where to put a react portal
     * (for tooltips and such). Normally, the default behavior is adequeate,
     * but for specialized cases (like rendering inside a popup from the parent
     * window) this is insufficient. This sort of information is inappropriate
     * to pass via properties to the generic host, so instead hosts can use this
     * context to describe that sort of information to type editor instances.
     */
    export const Context = React.createContext<IContext>({
        portalHostNode: document.body
    });
}
