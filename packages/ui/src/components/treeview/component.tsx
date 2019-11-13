import * as React from "react";
import { TreeModel } from "./model";
import { renderOnEmit } from "../reacthelpers";

/**
 * React control for displaying a comprehensive tree view.
 *
 * This component is fully controlled, and depends on a CSS stylesheet at
 * [@mavenomics/ui/style/treeview.css].
 */
export function TreeView<T extends TreeModel.TreeNode>({
    model,
    onSelect,
    onCommit,
    onCollapse,
    preview,
    render = (node) => node.key
}: TreeView.IProps<T>): React.ReactElement {
    renderOnEmit(model.onUpdated);
    return (
        <div className="m-TreeView">
            <Private.TreeLevel>
                {model.nodes.map(i => (<Private.TreeNode
                    node={i as T}
                    key={"TreeNode" + i.key}
                    {...{
                        model,
                        onSelect,
                        render,
                        preview,
                        onCollapse,
                        onCommit
                    }} />))}
            </Private.TreeLevel>
        </div>
    );
}

export namespace TreeView {
    export interface IProps<T extends TreeModel.TreeNode> {
        /** The items contained in the tree. */
        model: TreeModel<T>;

        /** Callback when an item is selected. */
        onSelect: (this: void, key: string) => void;

        /** Callback when an item is 'super' selected.
         *
         * Refer to the documentation for [ListBox].onCommit for more details.
         */
        onCommit?: (this: void, key: string) => void;

        /** Callback when an item is collapsed.
         *
         * Note: The consumer must update the tree to set isCollapsed
         * on the given node.
         */
        onCollapse: (this: void, key: string, state: boolean) => void;
        preview?: Private.IDragPreview;
        render?: (this: void, node: T) => React.ReactElement | string;
    }
}

export const enum TreeDropZone {
    InsertAbove = "insert-above",
    InsertInto = "insert-into",
    InsertBelow = "insert-below"
}

namespace Private {
    export function FlippyTriangle({isCollapsed, onCollapse}: FlippyTriangle.IProps) {
        return (<button className="m-FlippyTriangle"
            onClick={() => onCollapse.call(void 0, !isCollapsed)}
            data-collapsed={"" + isCollapsed}></button>);
    }

    export namespace FlippyTriangle {
        export interface IProps {
            isCollapsed: boolean;
            onCollapse: (this: void, willCollapse: boolean) => void;
        }
    }

    export const TreeLevel: React.FC = ({
        children
    }) => {
        return (<ul className="m-TreeView-Level">
            {children}
        </ul>);
    };

    export function TreeNode<T extends TreeModel.TreeNode>({
        model, node, onCollapse, onSelect, onCommit, render, preview
    }: TreeNodeProps<T>) {
        const hasChildren = node.children.length > 0;
        return (<li key={node.key}
                className="m-TreeView-Node"
                data-children={node.children.length}
                data-key={node.key}
                data-preview={preview && preview.key === node.key ? preview.action : null}
                data-preview-validity={preview && preview.key === node.key ? preview.validity : null}>
            <span tabIndex={node.selectable ? -1 : undefined}
                    className={"m-TreeView-Node-row" + (node.isSelected ? " m-selected" : "")}
                    onFocus={ev => {
                        if (!node.selectable) return;
                        onSelect.call(void 0, node.key);
                    }}
                    onDoubleClick={ev => {
                        if (onCommit) {
                            onCommit.call(void 0, node.key);
                        }
                    }}>
                {
                    hasChildren ? (<FlippyTriangle
                        isCollapsed={node.isCollapsed}
                        onCollapse={(willCollapse) => {
                            onCollapse.call(void 0, node.key, willCollapse);
                        }}/>) : null
                }
                <span className="m-TreeView-Node-content">
                    { render.call(void 0, node) }
                </span>
            </span>
            {!node.isCollapsed && hasChildren ? (<TreeLevel>
                {node.children.map(i => {
                    if (preview && preview.source === i.key) {
                        return; // don't render it
                    }
                    return (<TreeNode
                        key={"TreeLevel" + i.key}
                        node={i}
                        {...{
                            model,
                            onSelect,
                            onCommit,
                            onCollapse,
                            render,
                            preview
                        }}
                    />);
                })}
            </TreeLevel>) : null}
        </li>);
    }

    export interface IDragPreview {
        key: string;
        action: TreeDropZone;
        validity: "valid" | "invalid";
        source: string;
    }

    interface TreeNodeProps<T extends TreeModel.TreeNode> {
        model: TreeModel<T>;
        node: T;
        onSelect: (this: void, key: string) => void;
        onCommit?: (this: void, key: string) => void;
        onCollapse: (this: void, key: string, state: boolean) => void;
        render: (this: void, node: T) => React.ReactElement | string | null;
        preview?: IDragPreview;
    }
}
