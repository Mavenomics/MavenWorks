import { IterTools } from "@mavenomics/coreutils";
import { Subject, Observable, animationFrameScheduler } from "rxjs";
import { debounceTime } from "rxjs/operators";
import { IDisposable } from "@phosphor/disposable";

type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;

/**
 * A model for a [TreeView] or [TreeList].
 * 
 * The recommended way to create a TreeModel is via `TreeModel.Create`, which
 * will automatically fill out any missing info in each tree node:
 * 
 * ```ts
 * const model = TreeModel.Create([
 *     {
 *         key: "KeyA",
 *         children: [
 *             { key: "KeyB", isSelected: true }
 *             { key: "KeyC" }
 *         ]
 *     }
 * ]);
 * ```
 * 
 * This will create a model that you can then pass to the tree view.
 * Models are most convenient to work with inside Phosphor, but can be used
 * inside pure React components as long as the model is disposed of properly.
 * 
 * @typeparam _NodeData An interface representing the full tree model. If you
 * define this, TS will check and autocomplete inside helper methods both on
 * this class and in the tree lists. If you don't, then TS will only check
 * and complete on the base TreeModel.TreeNode interface.
 */
export class TreeModel<
    _NodeData extends TreeModel.TreeNode = TreeModel.TreeNode
> implements IDisposable {
    /**
     * Create a new TreeModel with the given tree of nodes, filling out any
     * missing data as appropriate by using TreeModel.DefaultNode.
     *
     * @param nodes A tree of partial node data
     * @returns An instance of a TreeModel containing the tree defined in `nodes`.
     */
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

    /**
     * Verify that each node's key is unique to the tree.
     *
     * @param nodes A tree of partial node data to check.
     *
     * @returns Whether all nodes have unique keys.
     */
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

    /**
     * Fill out all options in a list of partial tree nodes.
     *
     * @param nodes A tree of partial tree data
     */
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

    /**
     * Check if an update struct contains any keys that cannot be updated using
     * TreeModel.update().
     * 
     * If you need to change these properties, `parent` should be handled by the
     * model only and `children` can be modified using a move action.
     *
     * @param node 
     * @returns Whether the update is valid or not
     */
    protected static IsValidUpdate(node: Partial<TreeModel.TreeNode>) {
        if ("parent" in node || "key" in node || "children" in node) return false;
        return true;
    }

    /** The default properties of a node */
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

    /** Whether this node has been disposed or not. */
    public get isDisposed() { return this._isDisposed; }

    /** A readonly JSON model of the tree. */
    public get nodes(): ReadonlyArray<Readonly<_NodeData>> {
        return this.roots;
    }

    /** An Observable that emits whenever this model has changed.
     * 
     * This is useful for Phosphor components, and for
     * `ReactHelpers.renderOnEmit()` (which will force a rerender on an
     * observable event).
     */
    public get onUpdated(): Observable<void> {
        return this._onUpdated;
    }

    protected get onUpdatedSrc(): Subject<void> {
        return this._onUpdatedSrc$;
    }

    /**
     * Dispose this model, making it unusable and safe for garbage collection.
     * 
     * This will throw away some resources this model holds, and complete all
     * observables. `complete`ing observables is important as doing so will
     * unhook all subscriptions on that observable, thus eliminating the need
     * for consumers to manually track that subscription (ie, using
     * `Subscription.unsubscribe()`).
     * 
     * If disposal doesn't occur, then this model may pin some items in memory
     * and cause memory leaks.
     */
    public dispose() {
        if (this._isDisposed) return;
        this._onUpdatedSrc$.complete();
        this.idCache.clear();
        this.roots.splice(0);
    }

    /**
     * Iterate through all the nodes of this tree, depth-first.
     */
    public [Symbol.iterator](): Iterator<Readonly<_NodeData>> {
        return IterTools.dfs_iter(this.roots, i => i.children);
    }

    /**
     * Get a particular node from the tree and return a readonly version of it.
     * 
     * @param key The ID of the node to fetch
     * @returns Either the node (if it exists) or `undefined`.
     */
    public get(key: string): Readonly<_NodeData> | undefined {
        return this.idCache.get(key);
    }

    /**
     * Update a particular node in the tree.
     *
     * @param key The ID of the node to update
     * @param node A JSON object representing the deltas to apply to the node.
     *
     * @throws If the tree does not contain a node with key `key`
     * @throws if the update object attempts to modify `key`, `parent`, or `children`.
     *
     * @remarks
     * 
     * Note: Some properties may not be updated by this function, such as
     * `parent` or `key`. Keys are supposed to be immutable over the lifetime of
     * the model- if you find yourself needing to mutate them, then you may need
     * to choose a different key.
     * 
     * `parent` and `children` should not be modified directly- use move actions
     * and the model will take care of the requisite updates.
     */
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

    /**
     * Select a particular node in the model.
     * 
     * This is mostly sugar for `update(key, {isSelected: true})`, with an
     * additional parameter to let you force-unselect other nodes. 
     * 
     * @param key The key of the node to select
     * @param unselectOthers Whether other selected nodes should also be unselected.
     */
    public selectNode(key: string, unselectOthers: boolean = false) {
        if (unselectOthers) {
            for (const child of this) {
                if (!child.isSelected) continue;
                this.update(child.key, {isSelected: false} as Partial<_NodeData>);
            }
        }
        this.update(key, {isSelected: true} as Partial<_NodeData>);
    }

    /**
     * Insert a new node into the tree.
     *
     * @param node The node to insert
     * @param parent The parent to insert the node into
     * @param index The index to insert this node into
     */
    public addNewNode(node: _NodeData, parent: string, index = 0) {
        const parentNode = this.idCache.get(parent);
        if (parentNode == null) {
            throw Error("Parent not found: " + parent);
        }
        node = this.insertNodeIntoParent(node, index, parentNode);
    }

    /**
     * Move the given node from one parent to another.
     */
    public moveNode(node: _NodeData, newParent: string | undefined, index: number) {
        const parentNode = newParent == null ? undefined : this.idCache.get(newParent);
        this.removeNodeFromParent(node);
        this.insertNodeIntoParent(node, index, parentNode);
    }

    /**
     * Remove a node from the tree.
     */
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
    /** The interface representing a node.
     * 
     * To add additional properties, extend this interface.
     */
    export interface TreeNode {
        /** An id that is unique within the tree */
        key: string;
        /** An array of children */
        children: Array<this>;
        /** Whether this node is expanded (false) or collapsed (true) */
        isCollapsed: boolean;
        /** Whether this node is unselected (false) or selected (true) */
        isSelected: boolean;
        /** Whether this node can be selected in the first place. */
        selectable: boolean;
        /** The parent of this node, or null if the node is a root node. */
        parent?: this;
    }
}
