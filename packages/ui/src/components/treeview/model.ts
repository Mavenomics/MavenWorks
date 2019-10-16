import { IterTools } from "@mavenomics/coreutils";
import { Subject, Observable, animationFrameScheduler } from "rxjs";
import { debounceTime } from "rxjs/operators";
import { IDisposable } from "@phosphor/disposable";

type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;

export class TreeModel<
    _NodeData extends TreeModel.TreeNode = TreeModel.TreeNode
> implements IDisposable {
    public static Create<_NodeData extends TreeModel.TreeNode>(
        // Use any, since TS doesn't handle recursive types very well. :(
        nodes: ({key: string, children?: any[]} & Partial<Omit<_NodeData, "parent" | "children">>)[]
    ) {
        if (!this.VerifyNodeKeyUniqueness(nodes)) {
            throw Error("All TreeNode keys must be unique in the tree!");
        }
        return new TreeModel(
            this.InsertParentRefsAndDefaults<_NodeData>(nodes)
        );
    }

    protected static VerifyNodeKeyUniqueness(nodes: ({key: string} & Partial<TreeModel.TreeNode>)[]) {
        const ids = new Set<string>();
        for (const node of IterTools.dfs_iter(nodes, i => i.children)) {
            if (ids.has(node.key)) {
                return false;
            }
            ids.add(node.key);
        }
        return true;
    }

    protected static InsertParentRefsAndDefaults<T extends TreeModel.TreeNode>(
        nodes: ({key: string, children?: any[]} & Partial<Omit<T, "parent" | "children">>)[]
    ): T[] {
        type _SlimNodeType = ({
            key: string, children?: any[]
        } & Partial<Omit<T, "parent" | "children">>);
        const recurseChildren = (parent: _SlimNodeType) => {
            const newParent = Object.assign({}, this.DefaultNode, parent);
            if (!parent.children) return newParent;
            const children = [];
            for (const child of newParent.children) {
                let newChild = Object.assign({}, this.DefaultNode, child);
                if (newChild.children.length > 0) {
                    newChild = recurseChildren(child as any) as any;
                }
                (newChild as any).parent = newParent;
                children.push(newChild);
            }
            newParent.children = children as any;
            return newParent;
        };

        return nodes.map(recurseChildren) as T[];
    }

    protected static IsValidUpdate(node: Partial<TreeModel.TreeNode>) {
        if ("parent" in node || "key" in node || "children" in node) return false;
        return true;
    }

    private static DefaultNode: Omit<TreeModel.TreeNode, "key" | "parent"> = {
        isCollapsed: false,
        isSelected: false,
        selectable: true,
        children: [],
    };

    protected idCache = new Map<string, Readonly<_NodeData>>();
    protected roots: _NodeData[];
    private _isDisposed = false;
    private _onUpdatedSrc$ = new Subject<void>();
    private _onUpdated = this._onUpdatedSrc$.asObservable().pipe(
        debounceTime(0, animationFrameScheduler)
        );

    protected constructor(roots: (_NodeData)[]) {
        this.roots = roots;
        this.fillIdCache();
    }

    public get isDisposed() { return this._isDisposed; }

    public get nodes(): ReadonlyArray<Readonly<_NodeData>> {
        return this.roots;
    }

    public get onUpdated(): Observable<void> {
        return this._onUpdated;
    }

    protected get onUpdatedSrc(): Subject<void> {
        return this._onUpdatedSrc$;
    }

    public dispose() {
        if (this._isDisposed) return;
        this._onUpdatedSrc$.complete();
        this.idCache.clear();
        this.roots.splice(0);
    }

    public [Symbol.iterator](): Iterator<Readonly<_NodeData>> {
        return IterTools.dfs_iter(this.roots, i => i.children);
    }

    public get(key: string): Readonly<_NodeData> | undefined {
        return this.idCache.get(key);
    }

    public update(key: string, node: Readonly<Partial<_NodeData>>) {
        if (!TreeModel.IsValidUpdate(node)) {
            throw Error("Invalid property override in tree node update");
        }
        const toUpdate = this.idCache.get(key);
        if (toUpdate == null) {
            throw Error("Node with key " + key + " not found!");
        }
        const newNode = Object.assign({}, toUpdate, node);
        this.replaceNode(toUpdate, newNode);
    }

    public selectNode(key: string, unselectOthers: boolean = false) {
        if (unselectOthers) {
            for (const child of this) {
                if (!child.isSelected) continue;
                this.update(child.key, {isSelected: false} as Partial<_NodeData>);
            }
        }
        this.update(key, {isSelected: true} as Partial<_NodeData>);
    }

    public addNewNode(node: _NodeData, parent: string, index = 0) {
        const parentNode = this.idCache.get(parent);
        if (parentNode == null) {
            throw Error("Parent not found: " + parent);
        }
        node = this.insertNodeIntoParent(node, index, parentNode);
    }

    public moveNode(node: _NodeData, newParent: string | undefined, index: number) {
        const parentNode = newParent == null ? undefined : this.idCache.get(newParent);
        this.removeNodeFromParent(node);
        this.insertNodeIntoParent(node, index, parentNode);
    }

    public deleteNode(node: _NodeData) {
        this.removeNodeFromParent(node);
    }

    /**
     * Unmount a node from it's parent.
     *
     * @private
     * @param toRemove The node to remove from the tree
     * @returns The removed node, with it's parent corrected.
     */
    protected removeNodeFromParent(toRemove: _NodeData) {
        const parent = toRemove.parent;
        let container = parent != null ? parent.children : this.roots;
        const oldIdx = container.indexOf(toRemove);
        if (oldIdx === -1) {
            throw Error("Old parent not found for node: " + toRemove.key);
        }
        container = [
            ...container.slice(0, oldIdx),
            ...container.slice(oldIdx + 1)
        ];
        if (parent == null) {
            this.roots = container;
        } else {
            parent.children = container;
        }
        toRemove.parent = undefined;
        this.idCache.delete(toRemove.key);
        this._onUpdatedSrc$.next();
        return toRemove;
    }

    /**
     * Insert a childless node into a given parent.
     *
     * The parent must be different from the node's current parent.
     *
     * @private
     * @param toInsert The node to insert
     * @param idx The index to insert the node into
     * @param [parent] The parent to insert the node into. If null, the node
     *                 will be inserted as a root node.
     * @returns The inserted node
     */
    protected insertNodeIntoParent(toInsert: _NodeData, idx: number, parent?: _NodeData) {
        let container = (parent == null ? this.roots : parent.children);
        container = [
            ...container.slice(0, idx),
            toInsert,
            ...container.slice(idx)
        ];
        if (parent == null) {
            this.roots = container;
        } else {
            parent.children = container;
        }
        toInsert.parent = parent;
        this.idCache.set(toInsert.key, toInsert);
        this._onUpdatedSrc$.next();
        return toInsert;
    }

    protected replaceNode(oldNode: _NodeData, newNode: _NodeData) {
        const parent = oldNode.parent;
        const idx = this.indexOfNode(oldNode);
        this.removeNodeFromParent(oldNode);
        newNode = this.insertNodeIntoParent(newNode, idx, parent);
        for (const child of newNode.children) {
            child.parent = newNode;
            this.idCache.set(child.key, child);
        }
        return newNode;
    }

    protected indexOfNode(node: _NodeData) {
        return (node.parent == null
            ? this.roots
            : node.parent.children).indexOf(node);
    }

    protected fillIdCache() {
        for (const child of this) {
            this.idCache.set(child.key, child);
        }
    }
}

export namespace TreeModel {
    export interface TreeNode {
        key: string;
        children: Array<this>;
        isCollapsed: boolean;
        isSelected: boolean;
        selectable: boolean;
        parent?: this;
    }
}
