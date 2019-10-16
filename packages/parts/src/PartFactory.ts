import { Part } from "./Part";
import { ErrorPart } from "./ErrorPart";
import { IterTools } from "@mavenomics/coreutils";
import { Subject, Observable, merge } from "rxjs";
import { IDisposable } from "@phosphor/disposable";

export class PartFactory implements Iterable<[string, typeof Part]>, IDisposable {
    private registry: Map<string, typeof Part> = new Map<string, typeof Part>();
    /** A PartFactory will fall back to it's parent if it doesn't have a part. */
    private readonly parent: PartFactory | null = null;
    /** Emits when a new part is added*/
    private readonly _OnUpdatedSrc$ = new Subject<string>();
    private readonly _OnUpdated: Observable<string>;
    private _isDisposed = false;

    constructor(parent?: PartFactory) {
        if (parent != null) {
            this.parent = parent;
            this._OnUpdated = merge(
                this.parent.OnUpdated,
                this._OnUpdatedSrc$
            );
        } else {
            this.parent = null;
            this._OnUpdated = this._OnUpdatedSrc$.asObservable();
        }
    }

    /** Emits when new parts are added to either this factory or any parent.
    */
    public get OnUpdated() { return this._OnUpdated; }

    public get isDisposed() { return this._isDisposed; }

    public dispose() {
        if (this._isDisposed) return;
        this._OnUpdatedSrc$.complete();
        this.registry.clear();
        (this as any).parent = null;
    }

    public registerPart(name: string, constructor: typeof Part) {
        constructor._FactoryName = name;
        this.registry.set(name, constructor);
        this._OnUpdatedSrc$.next(name);
    }

    public unregisterPart(name: string) {
        this.registry.delete(name);
    }

    public createPart(partName: string, args: Part.IOptions): Part {
        if (!this.has(partName)) {
            return new ErrorPart(args, partName);
        }
        // We need the any cast because we can't constrain T to be a concrete subtype of Part
        // So instead we just trust that it is
        let instance: Part;
        try {
            instance = new (this.get(partName)! as any)(args) as Part;
        } catch (err) {
            console.warn("Failed to initalize", partName);
            console.log(err);
            instance = new ErrorPart(args, partName);
        }
        return instance;
    }

    public getMetadataForPart(partName: string) {
        return (this.get(partName)!).GetMetadata();
    }

    public* [Symbol.iterator](): Iterator<[string, typeof Part]> {
        if (this.parent != null) {
            return yield* IterTools.merge(this.registry.entries(), this.parent);
        }
        return yield* this.registry.entries();
    }

    public has(partName: string): boolean {
        return this.registry.has(partName)
            || (this.parent != null && this.parent.has(partName));
    }

    public get(partName: string): typeof Part | undefined {
        if (!this.registry.has(partName) && this.parent) {
            return this.parent.get(partName);
        }
        return this.registry.get(partName);
    }

    public keys(): Iterable<string> {
        if (this.parent != null) {
            return IterTools.merge(this.registry.keys(), this.parent.keys());
        }
        return this.registry.keys();
    }
}
