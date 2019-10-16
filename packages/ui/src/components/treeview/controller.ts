import { TreeModel } from "./model";

export class TreeController<T extends TreeModel.TreeNode> {
    private static DefaultOptions: Required<TreeController.IOptions<any>> = {
        allowOrdering: false,
        canMove: () => true,
        canAcceptChildren: () => true,
        canInsertInto: () => true,
        onAfterMove: () => void 0,
    };

    private readonly model: TreeModel<T>;
    private readonly allowOrdering: boolean;
    private readonly callbacks: Required<Pick<TreeController.IOptions<T>, TreeController.Callbacks>>;

    constructor(
        model: TreeModel<T>,
        options: TreeController.IOptions<T> = {}
    ) {
        this.model = model;
        const opts = Object.assign(
            {},
            TreeController.DefaultOptions,
            options,
        ) as Required<TreeController.IOptions<T>>;
        const {allowOrdering, ...callbacks} = opts;
        this.allowOrdering = allowOrdering;
        this.callbacks = callbacks;
    }

    public async canBeginAction(node: T) {
        return await this.executeCallback(TreeController.Callbacks.CanMove, [node]);
    }

    public acceptsChildren(
        node: T,
    ) {
        return this.executeCallbackSync(
            TreeController.Callbacks.CanAcceptChildren,
            [node]
        ) as boolean;
    }

    public async canPerformAction(
        node: T,
        reference: T,
        action: TreeController.ActionType
    ) {
        switch (action) {
            case TreeController.ActionType.AddChild:
            case TreeController.ActionType.InsertInto:
                const allowChildren = await this.acceptsChildren(reference);
                if (!allowChildren) return false;
                return await this.executeCallback(
                    TreeController.Callbacks.CanInsertInto,
                    [reference, node]
                );
            case TreeController.ActionType.InsertAbove:
            case TreeController.ActionType.InsertBelow:
                const parent = reference.parent;
                if (parent == null) {
                    // TODO: Test root drops
                    return false;
                }
                return await this.executeCallback(
                    TreeController.Callbacks.CanInsertInto,
                    [parent, node]
                );
            case TreeController.ActionType.ReorderChild:
                return this.allowOrdering;
        }
    }

    /**
     * Execute an action on the tree model, emitting events as appropriate.
     *
     * @final Subclasses should not override this method. Use [performAction] instead.
     * @param node The node to move
     * @param reference The reference node for the move
     * @param action The type of action being executed
     * @param [args] Optional arguments for things like insertion index.
     */
    public async executeAction(
        node: T,
        reference: T,
        action: TreeController.ActionType,
        args?: {index?: number}
    ) {
        this.performAction(node, reference, action, args);
        this.executeCallback(TreeController.Callbacks.OnAfterMove, [
            node,
            reference,
            action,
            args
        ]);
    }

    protected performAction(
        node: T,
        reference: T,
        action: TreeController.ActionType,
        args?: {index?: number}
    ) {

        const referenceIdx = this.getReferenceIndex(node, reference);

        switch (action) {
            case TreeController.ActionType.AddChild:
                this.model.addNewNode(node, reference.key, args ? args.index : undefined);
                break;
            case TreeController.ActionType.InsertInto:
                this.model.moveNode(node, reference.key, 0);
                break;
            case TreeController.ActionType.InsertAbove:
                this.model.moveNode(node, reference.parent!.key, referenceIdx);
                break;
            case TreeController.ActionType.InsertBelow:
                this.model.moveNode(node, reference.parent!.key, referenceIdx + 1);
                break;
            case TreeController.ActionType.ReorderChild:
                if (!this.allowOrdering) {
                    break;
                }
                this.model.moveNode(node, node.parent!.key, args!.index!);
                break;
        }
    }

    private getReferenceIndex(node: T, reference: T) {
        const { parent } = reference;
        if (!this.allowOrdering || parent == null) {
            return 0;
        }
        let referenceIdx: number = parent.children.indexOf(reference);
        const nodeModel = this.model.get(node.key);
        if (nodeModel == null) return referenceIdx;
        if (nodeModel.parent === parent && parent.children.indexOf(nodeModel) < referenceIdx) {
            // account for the fact that the indicies will all shift down when
            // the node is moved
            referenceIdx -= 1;
        }
        return referenceIdx;
    }

    private async executeCallback<K extends TreeController.Callbacks>(
        name: K,
        args: ArgsType<TreeController.IOptions<T>[K]>
    ) {
        return await this.executeCallbackSync(name, args);
    }

    private executeCallbackSync<K extends TreeController.Callbacks>(
        name: K,
        args: ArgsType<TreeController.IOptions<T>[K]>
    ) {
        try {
            const fn = this.callbacks[name] as CallableFunction;
            const result = fn.bind(void 0)(...args);
            if (result instanceof Promise) {
                return result.catch(err => this.handleCallbackError(name, err));
            }
            return result;
        } catch (err) {
            return this.handleCallbackError(name, err);
        }
    }

    private handleCallbackError(name: string, err: Error) {
        console.warn("Callback " + name + " threw: ");
        console.warn(err);
        return false;
    }
}

export namespace TreeController {
    export interface IOptions<T extends TreeModel.TreeNode> {
        allowOrdering?: boolean;
        canMove?: (
            this: void,
            node: T
        ) => boolean | Promise<boolean>;
        canAcceptChildren?: (
            this: void,
            node: T
        ) => boolean;
        canInsertInto?: (
            this: void,
            node: T,
            toInsert: T
        ) => boolean | Promise<boolean>;
        onAfterMove?: (
            this: void,
            node: T,
            reference: T,
            action: TreeController.ActionType,
            args?: {index?: number}
        ) => void;
    }

    export const enum Callbacks {
        CanMove = "canMove",
        CanAcceptChildren = "canAcceptChildren",
        CanInsertInto = "canInsertInto",
        OnAfterMove = "onAfterMove",
    }

    export const enum ActionType {
        /**
         * A new child was added to the tree.
         */
        AddChild = "add-new-child",
        /**
         * A child in the tree was rearranged under it's current parent.
         *
         * @note This has no effect if the controller has `allowOrdering` set to `false`.
         */
        ReorderChild = "reorder-child",
        /**
         * A child in the tree was inserted into the reference node.
         */
        InsertInto = "insert-child-into",
        /**
         * A child was inserted as a sibling to the reference, ordered before it.
         *
         * @note This has no effect if the controller has `allowOrdering` set to `false`.
         */
        InsertAbove = "insert-sibling-above",
        /**
         * A child was inserted as a sibling to the reference, ordered after it.
         *
         * @note This has no effect if the controller has `allowOrdering` set to `false`.
         */
        InsertBelow = "insert-sibling-below",
    }
}
