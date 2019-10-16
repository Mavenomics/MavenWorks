import { ITypeEditorFactory, ITypeEditorConstructor, IDetailEditorConstructor } from "./interfaces";
import { FallbackEditor, FallbackDetailEditor } from "./fallback";
import { Type } from "@mavenomics/coreutils";

export class TypeEditorFactory implements ITypeEditorFactory {
    public static Instance: TypeEditorFactory;

    /**
     * Create a new TypeEditorFactory (if there isn't one already) and return it
     *
     * @static
     */
    public static Create() {
        if (this.Instance != null) {
            return this.Instance;
        }
        return this.Instance = new TypeEditorFactory();
    }

    private registry = new Map<Type, ITypeEditorConstructor<unknown>>();
    private detailRegistry = new Map<Type, IDetailEditorConstructor<unknown>>();
    private suppressedDetailEditors = new Set<Type>();

    protected constructor() {}

    getEditor<T>(type: Type): ITypeEditorConstructor<T> {
        if (!this.registry.has(type)) {
            return FallbackEditor;
        }
        return this.registry.get(type)! as ITypeEditorConstructor<T>;
    }

    isDetailEditorSuppressed(type: Type): boolean {
        return this.suppressedDetailEditors.has(type);
    }

    getDetailEditor<T>(type: Type): IDetailEditorConstructor<T> {
        if (!this.detailRegistry.has(type)) {
            return FallbackDetailEditor as IDetailEditorConstructor<T>;
        }
        return this.detailRegistry.get(type)! as IDetailEditorConstructor<T>;
    }

    registerEditor<T>(type: Type, editor: ITypeEditorConstructor<T>): void {
        if (this.registry.has(type)) {
            console.warn("Warning: Inline type editor already registered for type " + type.serializableName);
            console.warn("Overwriting with " + editor.name);
        }

        this.registry.set(type, editor as ITypeEditorConstructor<unknown>);
    }

    registerDetailEditor<T>(type: Type, editor: IDetailEditorConstructor<T>) {
        if (this.detailRegistry.has(type)) {
            console.warn("Warning: Detail type editor already registered for type " + type.serializableName);
            console.warn("Overwriting with " + editor.name);
        }

        this.detailRegistry.set(type, editor as IDetailEditorConstructor<unknown>);
    }

    suppressDetailEditor(type: Type) {
        this.suppressedDetailEditors.add(type);
    }
}
