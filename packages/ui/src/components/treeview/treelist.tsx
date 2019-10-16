import * as React from "react";
import { TreeView, TreeDropZone } from "./component";
import { TreeModel } from "./model";
import { TreeController } from "./controller";
import { MathTools } from "@mavenomics/coreutils";
import { Widget } from "@phosphor/widgets";
import { HoverManager } from "../../hovers";
import { ReactWrapperWidget } from "../../reactwidget";
import { usePrevious } from "../reacthelpers";

export function TreeList<T extends TreeModel.TreeNode>({
    model,
    allowMultiselect = false,
    showPreviews = true,
    globalHandler = document,
    controller = Private.getController(model, {allowOrdering: true}),
    onSelected = () => void 0,
    dragScope = "",
    render,
    renderDragPreview,
}: TreeList.IProps<T>): React.ReactElement {
    const [isDragging, setIsDragging] = React.useState(false);
    const [dragStart, setDragStart] = React.useState<[number, number] | null>(null);
    const [dragKey, setDragKey] = React.useState<T | null>(null);
    const [dragState, setDragState] = React.useState<TreeDropZone | null>(null);
    const [dragReference, setDragReference] = React.useState<T | null>(null);
    const [dragValidity, setIsDragValid] = React.useState<"valid" | "invalid" | null>(null);
    const wasDragging = usePrevious(isDragging);
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (wasDragging === isDragging) {
            return; // we only care about changes in isDragging
        }
        if (isDragging) {
            const hover = new class extends ReactWrapperWidget {
                render() {
                    if (renderDragPreview && dragKey) {
                        return (<span>{renderDragPreview.call(void 0, dragKey)}</span>);
                    } else {
                        return (<span>{dragKey ? dragKey.key : "..."}</span>);
                    }
                }
            };
            hover.addClass("m-TreeList-drag");
            const owner = new Widget({node: ref.current!});
            hover.node.innerHTML = dragKey ? dragKey.key : "node";
            HoverManager.GetManager()
                .openHover({
                    hover,
                    owner,
                    mode: "tooltip",
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 24
                });
            function handleEvent(this: void, ev: Event) {
                switch (ev.type) {
                    case "keydown":
                        const keyEv = ev as KeyboardEvent;
                        if (keyEv.key === "Escape") {
                            setIsDragging(false);
                        }
                        return;
                    case "pointerup":
                        setIsDragging(false);
                }
            }
            globalHandler.addEventListener("keydown", handleEvent);
            globalHandler.addEventListener("pointerup", handleEvent);
            return () => {
                globalHandler.removeEventListener("keydown", handleEvent);
                globalHandler.removeEventListener("pointerup", handleEvent);
                hover.dispose();
                owner.dispose();
            };
        } else {
            setDragStart(null);
            setDragKey(null);
            setDragState(null);
            setDragReference(null);
            setIsDragValid(null);
            Private.clearDrag(dragScope);
        }
    }, [isDragging, ref, dragKey]);
    return (<div className="m-TreeList"
        ref={ref}
        onPointerDown={ev => {
            // Note: React tears down events after the handler is synchronously
            // fired. Don't move lines referencing them into callbacks.
            setDragStart([ev.pageX, ev.pageY]);
            const reference = Private.getReference(ev.target as HTMLElement);
            if (reference == null) return;
            const node = model.get(reference);
            if (!node) return;
            controller.canBeginAction(node).then(canBegin => {
                if (!canBegin) {
                    setDragStart(null);
                    return;
                }
                setDragKey(node as React.SetStateAction<T | null>);
            }).catch(console.error);
        }}
        onPointerMove={async (ev) => {
            if (!isDragging) {
                if (dragStart == null) return;
                const dist = MathTools.Vec2.Norm(
                    MathTools.Vec2.Sub(dragStart, [ev.pageX, ev.pageY])
                );
                if (Math.abs(dist) > 5) {
                    setDragStart(null);
                    setIsDragging(true);
                }
            } else {
                const ref = Private.getReference(ev.target as HTMLElement);
                if (ref == null || ref === dragKey!.key) return;
                const node = dragKey!;
                const refNode = model.get(ref)!;
                const acceptsChildren = controller.acceptsChildren(refNode);
                const zone = Private.getDropZone(ev, acceptsChildren)!;
                setDragState(zone);
                setDragReference(model.get(ref)! as React.SetStateAction<T | null>);
                if (!await controller.canPerformAction(node, refNode, Private.dropZoneToAction(zone))) {
                    setIsDragValid("invalid");
                } else {
                    setIsDragValid("valid");
                }
            }
        }}
        onPointerLeave={ev => {
            if (!isDragging && dragStart != null) {
                setDragStart(null);
            }
            if (isDragging) {
                Private.setDrag(dragScope, dragKey!);
                setDragState(null);
                setDragReference(null);
            }
        }}
        onPointerEnter={ev => {
            if (!isDragging) {
                const key = Private.getDrag(dragScope);
                if (key == null) return;
                setIsDragging(true);
                setDragKey(key as React.SetStateAction<T | null>);
            }
        }}
        onPointerUp={ev => {
            setDragStart(null);
            const ref = Private.getReference(ev.target as HTMLElement);
            if (isDragging && ref != null && dragValidity === "valid") {
                const node = dragKey!;
                const refNode = model.get(ref)!;
                const acceptsChildren = controller.acceptsChildren(refNode);
                const zone = Private.getDropZone(ev, acceptsChildren)!;
                if (model.get(node.key) != null) {
                    controller.executeAction(node, refNode, Private.dropZoneToAction(zone));
                } else {
                    const addRef = zone === TreeDropZone.InsertInto ? refNode : refNode.parent;
                    let index = 0;
                    if (addRef == null) {
                        index = model.nodes.indexOf(refNode);
                    } else {
                        index = addRef.children.indexOf(refNode);
                    }
                    if (zone === TreeDropZone.InsertBelow) {
                        index += 1;
                    }
                    controller.executeAction(node, addRef as T, TreeController.ActionType.AddChild, {index});
                }
            }
            setIsDragging(false);
        }}>
        <TreeView
            model={model}
            onCollapse={(key, state) => model.update(key, {isCollapsed: state} as any)}
            onSelect={(key) => {
                model.selectNode(key, !allowMultiselect);
                onSelected.call(void 0, key);
            }}
            preview={isDragging && showPreviews ? {
                key: dragReference && dragReference.key || "",
                action: dragState || TreeDropZone.InsertInto,
                validity: dragValidity || "valid",
                source: dragKey && dragKey.key || "",
            } : undefined}
            render={render}
        />
    </div>);
}

export namespace TreeList {
    export interface IProps<NodeType extends TreeModel.TreeNode> {
        /**
         * The model to use for this tree view.
         *
         */
        model: TreeModel<NodeType>;
        /**
         * Whether to allow multiple nodes to be selected at once.
         *
         * @default false
         * @remarks
         * If this is true, previously selected nodes won't be cleared by
         * selecting a new one.
         *
         * TODO: Change this to be more like a desktop multiselect: shift+click,
         * ctrl+shift+click, etc.
         *
         */
        allowMultiselect?: boolean;
        /**
         * Whether to show previews when dragging nodes
         *
         * @default true
         */
        showPreviews?: boolean;
        /**
         * The element to use for attaching global event listeners.
         *
         * @default window.document
         * @remarks
         *
         * The tree list adds a few global event listeners to maintain a
         * consistent UX state- for instance, when releasing the mouse off the
         * tree, the list control must undo any 'drag' state.
         *
         * If this component is being rendered in a popup, then this must be
         * set to the popup's document.
         *
         * TODO: I might change this to use a ref with ownerDocument, making
         * this option unnecessary.
         *
         */
        globalHandler?: EventTarget;
        controller?: TreeController<NodeType>;
        onSelected?: (this: void, key: string) => void;
        /**
         * A callback for rendering a single node in the tree.
         *
         */
        render?: (this: void, node: NodeType) => React.ReactElement | string;
        /**
         * A callback for rendering the drag-preview tooltip, if dragging is enabled.
         *
         */
        renderDragPreview?: (this: void, node: NodeType) => React.ReactElement | string;
        /**
         * An optional scope to limit tree-to-tree dragging to.
         */
        dragScope?: string;
    }
}

namespace Private {
    function findParent(el: HTMLElement, predicate: (el: HTMLElement) => boolean): HTMLElement | null {
        let testEl: HTMLElement = el;
        while (testEl.parentNode != null) {
            if (predicate(testEl)) {
                return testEl;
            }
            testEl = testEl.parentNode as HTMLElement;
        }
        return null;
    }

    export function getReference(target: HTMLElement): string | null {
        if (!target.matches(".m-TreeView-Node *") && target.classList.contains("m-TreeView-Level")) {
            const reference = findParent(target, (e) => e.classList.contains("m-TreeView-Level"));
            if (reference === null || reference.parentElement == null) return null;
            return getReference(reference.parentElement!);
        } else if (target.matches(".m-TreeView-Node *")) {
            const reference = findParent(target, e => e.classList.contains("m-TreeView-Node"));
            if (reference === null) return null;
            return reference.dataset["key"]!;
        }
        return null;
    }

    export function getDropZone(ev: React.PointerEvent, acceptsChildren: boolean = true) {
        const target = ev.target as HTMLElement;
        if (acceptsChildren
            && !target.matches(".m-TreeView-Node *")
            && target.classList.contains("m-TreeView-Level")
        ) {
            // this is a parent
            return TreeDropZone.InsertInto;
        } else if (target.matches(".m-TreeView-Node *")) {
            const {clientY} = ev;
            const reference = findParent(target, e => e.classList.contains("m-TreeView-Node-row")) || target;
            const {top, height} = reference.getBoundingClientRect();
            const adjPos = ((height + top) - clientY) / height;
            if (!acceptsChildren) {
                return adjPos > 0.5 ? TreeDropZone.InsertAbove : TreeDropZone.InsertBelow;
            }
            if (adjPos < 0.25) {
                return TreeDropZone.InsertBelow;
            } else if (adjPos > 0.75) {
                return TreeDropZone.InsertAbove;
            } else return TreeDropZone.InsertInto;
        } else return null;
    }

    export function dropZoneToAction(zone: TreeDropZone) {
        switch (zone) {
            case TreeDropZone.InsertAbove:
                return TreeController.ActionType.InsertAbove;
            case TreeDropZone.InsertInto:
                return TreeController.ActionType.InsertInto;
            case TreeDropZone.InsertBelow:
                return TreeController.ActionType.InsertBelow;
        }
    }

    const Controllers = new WeakMap<TreeModel, TreeController<any>>();

    export function getController<T extends TreeModel.TreeNode>(
        model: TreeModel<T>,
        options?: TreeController.IOptions<T>
    ) {
        if (Controllers.has(model)) {
            return Controllers.get(model)!;
        }
        const controller = new TreeController(model, options);
        Controllers.set(model, controller);
        return controller;
    }

    const GlobalDrag = new Map<string, TreeModel.TreeNode>();

    export function setDrag(namespace: string, node: TreeModel.TreeNode) {
        GlobalDrag.set(namespace, node);
    }

    export function getDrag(namespace: string): TreeModel.TreeNode | null {
        return GlobalDrag.get(namespace) || null;
    }

    export function clearDrag(namespace: string) {
        GlobalDrag.delete(namespace);
    }
}
