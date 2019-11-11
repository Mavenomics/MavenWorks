import * as React from "react";
import { TreeModel } from "./model";
import { renderOnEmit } from "../reacthelpers";

/**
 * React control for displaying a comprehensive tree view.
 *
 * This component is fully controlled, and depends on a CSS stylesheet at
 * [@mavenomics/ui/style/treeview.css].
 * 
 * The stylesheet also depends on a set of variables defined in
 * [@mavenomics/ui/style/variables.css], but you can define them yourself if
 * you need to customize the colors:
 * 
 *  - `--m-active-font-color`: The font color of selected items
 *  - `--m-inactive-font-color`: The font color of unselected items
 *  - `--m-selected-ui-color`: The background color of selected items
 *  - `--m-inactive-ui-color`: The background color of unselected items being
 *    hovered over with the mouse
 *  - `--m-hover-selected-ui-color`: The background color of selected items
 *    being hovered over with the mouse
 * 
 * The following variables are optional, and only have to be defined if you
 * use drag-and-drop. The `variables` stylesheet defines them by default.
 *
 *  - `--m-valid-ui-color`: The border color of a 'valid' drop preview.
 *    Try not to use green for this- the default variables sheet uses a light
 *    blue. Colorblind individuals may have some difficulty distinguishing
 *    valid actions if you use green.
 *  - `--m-warn-ui-color`: The border color of an 'invalid' drop preview.
 *    Like above, be sure that whatever color you pick for this is
 *    distinguishable. A good rule of thumb is to ensure the luminosity is
 *    different, so that one appears darker than the other even in complete
 *    grayscale.
 * 
 * @example
 *
 * // A simple tree control that shows a tree with expand/collapse
 * // Note that the model can be managed directly by the TreeList, instead of
 * // being created by us directly.
 *
 * import { TreeModel, TreeView } from "@mavenomics/ui";
 *
 * const model = TreeModel.Create([
 *     {
 *         key: "Root A",
 *         children: [
 *             { key: "Child A" }
 *             { key: "Child B" }
 *             {
 *                 key: "Child C",
 *                 isCollapsed: true,
 *                 children: [
 *                     { key: "Grandchild A" }
 *                     { key: "Grandchild B" }
 *                     { key: "Grandchild C" }
 *                 ]
 *             }
 *             
 *         ]
 *     }
 * ]);
 *
 * const MyTree = () => (<TreeView
 *     model={model}
 *     onSelect={key => model.selectNode(key, true)} 
 *     onSelect={
 *         (key, willCollapse) => model.update(key, { isCollapsed: willCollapse })
 *     } />);
 *
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

/**
 * Enum representing possible drop actions.
 *
 * Because this is a const enum, you can also just use string literals.
 */
export const enum TreeDropZone {
    /** The proposed action will insert a sibling ordered above the current node. */
    InsertAbove = "insert-above",
    /** The proposed action will insert a child into the current node. */
    InsertInto = "insert-into",
    /** The proposed action will insert a sibling ordered below the current node. */
    InsertBelow = "insert-below"
}

namespace Private {
    /**
     * A convenience helper for an expand/collapse button.
     * 
     * TODO: We should generalize this, FlippyTriangles are used elsewhere
     */
    export function FlippyTriangle({isCollapsed, onCollapse}: FlippyTriangle.IProps) {
        return (<button className="m-FlippyTriangle"
            onClick={() => onCollapse.call(void 0, !isCollapsed)}
            data-collapsed={"" + isCollapsed}></button>);
    }

    export namespace FlippyTriangle {
        export interface IProps {
            /** Whether the triangle is collapsed (true) or expanded (false) */
            isCollapsed: boolean;
            /** Callback called when the triangle is clicked.
             * 
             * Note: This will not modify internal state- the parent component
             * must change the [isCollapsed] prop.
             * 
             * @param willCollapse The new state that the triangle will take on.
             * For instance, if a user clicks on a collapsed triange, it should
             * expand, hence `willCollapse` will be false.
             */
            onCollapse: (this: void, willCollapse: boolean) => void;
        }
    }

    /** A helper component for representing a list of siblings */
    export const TreeLevel: React.FC = ({
        children
    }) => {
        return (<ul className="m-TreeView-Level">
            {children}
        </ul>);
    };

    /** A helper component for representing an individual node and it's children. */
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
