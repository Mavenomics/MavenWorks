import { BoxLayout, SplitPanel, Widget } from "@phosphor/widgets";
import { Interactions, HoverManager, ReactWrapperWidget, TreeModel, TreeView } from "@mavenomics/ui";
import { Dashboard } from "@mavenomics/dashboard";
import { IHelpDocProvider } from "./docprovider";
import { MessageLoop } from "@phosphor/messaging";
import { PartFactory, PartUtils } from "@mavenomics/parts";
import { WidgetLayoutRegion } from "@mavenomics/layout";
import { URLExt } from "@jupyterlab/coreutils";
import * as React from "react";
import { Subject, Observable } from "rxjs";

export class HelpBrowser extends Widget {
    public readonly layout: BoxLayout;
    private listbox: HelpDocTree;

    constructor(docProvider: IHelpDocProvider, factory: PartFactory) {
        super();
        this.layout = new BoxLayout({
            direction: "left-to-right"
        });
        const panel = new SplitPanel();
        this.listbox = new HelpDocTree(docProvider);
        const content = new HelpDocRenderer(factory);

        this.listbox.onSelect.subscribe((doc) => {
            content.dispose();
            content.src = docProvider.getDocument(doc);
        });
        this.layout.addWidget(panel);
        panel.addWidget(this.listbox);
        panel.addWidget(content);
        setTimeout(() => panel.setRelativeSizes([0.3, 0.7]));
    }
}

export class HelpDocRenderer extends Widget {
    private _src = "";
    private buttons: Interactions.Button[] = [];

    constructor(private partFactory: PartFactory) {
        super();
        this.node.style.overflowY = "scroll";
    }

    public set src(newSrc: string) {
        this.destroyView();
        this._src = newSrc;
        this.setupView();
    }

    public dispose() {
        if (this.isDisposed) return;
        this.destroyView();
    }

    protected onAfterAttach() {
        this.setupView();
    }

    protected onBeforeDetach() {
        this.destroyView();
    }

    private setupView() {
        this.node.innerHTML = this._src;
        this.node.querySelectorAll("code.language-mql").forEach(el => {
            el.parentElement!.classList.add("m-runnable-example");
            const helper = new Interactions.Button();
            this.buttons.push(helper);
            helper.label = "Run this query";
            helper.onClicked.subscribe(() => this.openExample(el.textContent!));
            helper.addClass("m-example-btn");
            MessageLoop.sendMessage(helper, Widget.Msg.BeforeAttach);
            el.insertAdjacentElement("afterend", helper.node);
            MessageLoop.sendMessage(helper, Widget.Msg.AfterAttach);
        });
    }

    private destroyView() {
        this.buttons.map(i => i.dispose());
        this.node.innerHTML = "";
    }

    private async openExample(srcText: string) {
        const dashboard = new Dashboard({
            baseUrl: "/",
            baseViewUrl: "/",
            factory: this.partFactory
        });
        const { bindings, partManager, layoutManager } = dashboard;
        const globals = bindings.getBindingEvaluator("Mql")
            .getGlobalsForBinding(srcText);
        const part = await partManager.addPart("SlickGrid", {
            options: {
                [PartUtils.INPUT_OPTION]: {
                    type: "Mql",
                    expr: srcText,
                    globals
                },
                "Show Path Column": { typeName: "Boolean", value: true }
            },
            name: "SlickGrid",
            id: "ExampleOutput"
        });
        const region = new WidgetLayoutRegion(layoutManager, part, "ExampleOutput");
        region.setLayoutProperty("caption", "Example Output");
        layoutManager.root.addChild(region);
        await HoverManager.GetManager().launchDialog(
            dashboard,
            this,
            640,
            480,
            "MQL Example",
            [{ text: "Dismiss" }]
        );
    }
}

class HelpDocTree extends ReactWrapperWidget {
    private model?: TreeModel<IFullNode> = TreeModel.Create([]);
    private _onSelect = new Subject<string>();

    constructor(private provider: IHelpDocProvider) {
        super();
        this.makeModel();
        this.node.style.overflowY = "auto";
    }

    public get onSelect(): Observable<string> { return this._onSelect; }

    protected render() {
        return (<TreeView
            model={this.model!}
            onSelect={(key) => {
                const node = this.model!.get(key)!;
                this._onSelect.next(node.name!);
                this.model!.selectNode(key, true);
            }}
            render={(node) => {
                return node.name;
            }}
            onCollapse={(key, state) => this.model!.update(key, {isCollapsed: state})}
        />);
    }

    private makeModel() {
        const parents = new Map<string, INode>();
        const roots = new Set<INode>();

        let providerMetadata = [...this.provider.getMetadata()];
        providerMetadata.sort((a, b) => {
            if (a == null) return -1;
            if (b == null) return 1;
            const pathA = URLExt.join((a.path || "/"), a.title);
            const pathB = URLExt.join((b.path || "/"), b.title);
            return pathA.localeCompare(pathB);
        });
        for (let docIdx = 0; docIdx < providerMetadata.length; docIdx++) {
            const metadata = providerMetadata[docIdx];
            if (metadata == null) {
                continue;
            }
            const fullPath = URLExt.join((metadata.path || "/"), metadata.title);
            const path = fullPath.split("/");
            for (let i = 1; i < path.length; i++) {
                const parent = path[i];
                const nodePath = path.slice(0, i + 1).join("/");
                if (parents.has(parent)) {
                    continue;
                }
                const oldParent = path[i - 1];
                const node: INode = {
                    children: [],
                    key: nodePath,
                    name: parent,
                    selectable: i === (path.length - 1)
                };
                if (node.selectable) {
                    node.docIdx = docIdx;
                }
                if (parents.has(oldParent)) {
                    parents.get(oldParent)!.children.push(node);
                } else {
                    roots.add(node);
                }
                parents.set(parent, node);
            }
        }

        this.model = TreeModel.Create([...roots]);
        parents.clear();
        roots.clear();
        this.update();
    }
}

interface INode {
    children: INode[];
    key: string;
    name: string;
    docIdx?: number;
    selectable: boolean;
}

type IFullNode = INode & TreeModel.TreeNode;
