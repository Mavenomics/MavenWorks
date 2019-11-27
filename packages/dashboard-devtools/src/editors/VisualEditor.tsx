import * as React from "react";
import { TreeModel, TreeList, TreeController, renderOnEmit } from "@mavenomics/ui";
import { Dashboard } from "@mavenomics/dashboard";
import {
    StackPanelLayoutRegion,
    TabPanelDashboardLayoutRegion,
    CanvasLayoutRegion,
    GridLayoutRegion,
    DashboardLayoutRegion,
    IDashboardLayoutProperties,
    RegionWithChildren,
    LayoutTypes,
    LayoutManager,
    WidgetLayoutRegion
} from "@mavenomics/layout";
import { JSONObject, UUID } from "@phosphor/coreutils";
import { debounceTime } from "rxjs/operators";
import { RegionPropertiesEditor } from "./RegionPropertiesEditor";

export function VisualEditor(this: void, {
    dashboard
}: VisualEditor.IProps): React.ReactElement {
    VisualEditor.withCleanup(dashboard);
    const [selectedRegion, setSelected] = React.useState<string | null>(null);

    const {layoutManager} = dashboard;

    renderOnEmit(layoutManager.OnDirty
        .pipe(debounceTime(300)));

    const activeRegion = layoutManager.getRegion(selectedRegion || "");
    const {
        containers,
        containersController,
        layout,
        layoutController
    } = VisualEditor.getModels(dashboard);

    return (<div className="m-VisualEditor-dialog">
        <div className="m-VisualEditor-column">
            <TreeList
                model={containers}
                controller={containersController}
                showPreviews={false}
                render={(node) => {
                    if (node.type === "container") {
                        const metadata = node.ctor.GetMetadata();
                        return (<span>
                            <span className={metadata.iconClass} style={{
                                    fontSize: "1.25rem",
                                    verticalAlign: "middle",
                                    marginRight: "3px"
                                }}>
                                {metadata.iconText}
                            </span>
                            {node.key}
                        </span>);
                    } else return node.key;
                }}/>
        </div>
        <div className="m-VisualEditor-column">
            <TreeList model={layout}
                controller={layoutController}
                onSelected={(key) => setSelected(key)}
                render={node => <VisualEditor.VisualTreeNode {...{ node, layout }} />}
                renderDragPreview={(node) => {
                    return node.caption;
                }}/>
        </div>
        <div className="m-VisualEditor-column">
            <label title="Whether to temporarily force all titlebars visible.">
                <input type="checkbox"
                    checked={layoutManager.forceTitlebars}
                    onChange={(ev) => {
                        layoutManager.forceTitlebars = ev.currentTarget.checked;
                    }} />
                Force Show Titlebars?
            </label>
            <RegionPropertiesEditor dashboard={dashboard} region={activeRegion} />
        </div>
    </div>);
}

export namespace VisualEditor {
    export interface IProps {
        dashboard: Dashboard;
    }

    interface ITreeMap {
        containers: TreeModel<Models.Containers.INode>;
        containersController: TreeController<Models.Containers.INode>;
        layout: TreeModel<Models.Layout.INode>;
        layoutController: TreeController<Models.Layout.INode>;
    }

    namespace Models {
        export namespace Containers {
            export type INode = INewContainerModel
                              | IExternalPartModel
                              | IPartNode
                              | IBasicNode;

            interface INewContainerModel extends TreeModel.TreeNode {
                type: "container";
                ctor: typeof RegionWithChildren;
            }

            interface IExternalPartModel extends TreeModel.TreeNode {
                type: "external-part";
                model: JSONObject;
            }

            interface IPartNode extends TreeModel.TreeNode {
                type: "part";
            }

            interface IBasicNode extends TreeModel.TreeNode {
                type: "node";
            }
        }

        export namespace Layout {
            export type INode = IContainer | IWidget;

            interface IBaseNode extends TreeModel.TreeNode {
                caption: string;
                isContainer: boolean;
                iconClass: string;
                iconText: string;
            }

            interface IContainer extends IBaseNode {
                isContainer: true;
                type: LayoutTypes.CanvasLayoutRegion
                    | LayoutTypes.GridPanelLayoutRegion
                    | LayoutTypes.StackPanelLayoutRegion
                    | LayoutTypes.TabPanelDashboardLayoutRegion;
            }

            interface IWidget extends IBaseNode {
                isContainer: false;
                children: [] & {length: 0};
                type: LayoutTypes.WidgetLayoutRegion;
            }
        }
    }

    const controllerMapping = new WeakMap<Dashboard, ITreeMap>();

    export function getModels(dashboard: Dashboard) {
        let mapping = controllerMapping.get(dashboard);
        if (mapping != null) return mapping;
        const { externalParts, factory } = dashboard;
        const containersModel = TreeModel.Create<Models.Containers.INode>([{
                key: "Containers",
                type: "node",
                children: [
                    {type: "container", key: "Stack Panel",    ctor: StackPanelLayoutRegion},
                    {type: "container", key: "Tab Panel",      ctor: TabPanelDashboardLayoutRegion},
                    {type: "container", key: "Canvas",         ctor: CanvasLayoutRegion},
                    {type: "container", key: "Grid",           ctor: GridLayoutRegion},
                ]
            }, {
                key: "External Parts",
                type: "node",
                children: externalParts ? externalParts.getMetadata().map(i => {
                    return {
                        key: i.name,
                        model: i.model,
                        type: "external-part"
                    };
                }).sort((a, b) => a.key.localeCompare(b.key)) : []
            }, {
                key: "New Parts",
                children: Array.from(factory.keys()).map(i => {
                    return {
                        key: i,
                        type: "part"
                    };
                }).sort((a, b) => a.key.localeCompare(b.key)),
            }
        ]);
        const layout = LayoutModel.CreateModel(dashboard);
        mapping = {
            containers: containersModel,
            containersController: new TreeController(containersModel, {
                canMove: (node) => node.type != null && (node.type === "container" || node.type.includes("part")),
                canAcceptChildren: () => false,
                canInsertInto: () => false
            }),
            layout,
            layoutController: new TreeController<Models.Layout.INode>(layout, {
                allowOrdering: true,
                canAcceptChildren: (node) => {
                    return node.isContainer;
                },
            })
        };
        controllerMapping.set(dashboard, mapping);
        return mapping;
    }

    export function withCleanup(dashboard: Dashboard) {
        return React.useEffect(() => {
            return () => {
                const mapping = controllerMapping.get(dashboard);
                if (mapping == null) return;
                mapping.containers.dispose();
                mapping.layout.dispose();
                controllerMapping.delete(dashboard);
            };
        }, [dashboard]);
    }

    export function layoutAsTree(layoutManager: LayoutManager): [Models.Layout.INode] {
        function descendLayout(
            node: DashboardLayoutRegion<IDashboardLayoutProperties>
        ): any {
            const metadata = node.constructor.GetMetadata();
            return {
                key: node.id,
                iconClass: metadata.iconClass,
                iconText: metadata.iconText,
                type: node.typeName,
                isContainer: node instanceof RegionWithChildren,
                caption: node.getLayoutProperty("caption"),
                children: node instanceof RegionWithChildren ? node.widgets.map(descendLayout) : []
            };
        }
        return [descendLayout(layoutManager.root as any)];
    }

    export class LayoutModel extends TreeModel<Models.Layout.INode> {
        public static CreateModel(
            dashboard: Dashboard
        ) {
            const model = this.InsertParentRefsAndDefaults<Models.Layout.INode>(
                layoutAsTree(dashboard.layoutManager)
            );

            return new LayoutModel(
                model,
                dashboard
            );
        }

        private dashboard: Dashboard;

        protected constructor(
            nodes: Models.Layout.INode[],
            dashboard: Dashboard,
        ) {
            super(nodes);
            this.dashboard = dashboard;
            const { layoutManager } = dashboard;
            layoutManager.OnDirty
                .pipe(debounceTime(300))
                .subscribe(() => {
                    this.idCache.clear();
                    this.roots = LayoutModel.InsertParentRefsAndDefaults<
                        Models.Layout.INode
                    >(layoutAsTree(layoutManager));
                    this.fillIdCache();
                    this.onUpdatedSrc.next();
                });
            layoutManager.focusedRegionChanged.connect(this._onFocused, this);
        }

        public dispose() {
            if (this.isDisposed) return;
            this.dashboard.layoutManager.focusedRegionChanged.disconnect(this._onFocused, this);
        }

        public async addNewNode(node: TreeModel.TreeNode, newParent: string | undefined, index: number) {
            const { layoutManager, externalParts, partManager } = this.dashboard;
            const parent = layoutManager.getRegion(newParent!)! as RegionWithChildren;
            const src = node as Models.Containers.INode;
            let newChild: DashboardLayoutRegion<any>;
            switch (src.type) {
                case "container":
                    newChild = new (src.ctor as any as {
                        new(l: LayoutManager): RegionWithChildren
                    })(layoutManager);
                    newChild.setLayoutProperty("prunable", false);
                    break;
                case "external-part":
                    // todo: move creation logic elsewhere
                    if (externalParts == null) return;
                    const id = UUID.uuid4();
                    await externalParts.renderModel(src.model, null, id);
                    const widget = externalParts.getPartById(id)!;
                    newChild = new WidgetLayoutRegion(layoutManager, widget, id);
                    break;
                case "part":
                    const part = await partManager.addPart(src.key);
                    newChild = new WidgetLayoutRegion(layoutManager, part, part.uuid);
                    break;
                default:
                    return;
            }
            parent.insertChild(index, newChild!);
            return;
        }

        public async moveNode(node: Models.Layout.INode, newParent: string | undefined, index: number) {
            const { layoutManager } = this.dashboard;
            const parent = layoutManager.getRegion(newParent!)! as RegionWithChildren;
            const toMove = layoutManager.getRegion(node.key)!;
            parent.insertChild(index, toMove);
        }

        public deleteNode(node: Models.Layout.INode) {
            const { layoutManager } = this.dashboard;
            layoutManager.removeRegion(node.key);
        }

        public selectNode(key: string) {
            super.selectNode(key, true);
            const { layoutManager } = this.dashboard;
            const region = layoutManager.getRegion(key)!;
            region.focus();
        }

        private _onFocused(_sender: LayoutManager, focusedRegion: DashboardLayoutRegion<any> | null) {
            for (const child of this) {
                if (!child.isSelected) continue;
                // node is already focused
                if (focusedRegion && child.key === focusedRegion.id) return;
                this.update(child.key, {isSelected: false});
            }
            if (focusedRegion == null) {
                return;
            }
            this.update(focusedRegion.id, {isSelected: true});
        }
    }

    export const VisualTreeNode: React.FC<{
        node: Models.Layout.INode,
        layout: TreeModel
    }> = ({ node, layout }) => {
        let icon = null;
        if (node.type !== LayoutTypes.WidgetLayoutRegion) {
            icon = (<span className={node.iconClass} style={{
                    fontSize: "1.25rem",
                    verticalAlign: "middle",
                    marginRight: "3px"
                }}>
                {node.iconText}
            </span>);
        }
        return (<span className="m-VisualTreeNode">
            {icon}
            <span className="m-VisualTreeNode-caption">{node.caption}</span>
            {
                node.parent == null ? null :
                <button className="m-VisualTreeNode-delete"
                    onClick={() => layout.deleteNode(node)}>
                        <i className="fa fa-trash" aria-hidden></i>
                </button>
            }
        </span>);
    };
}
