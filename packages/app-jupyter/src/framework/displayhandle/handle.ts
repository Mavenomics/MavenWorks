import { Widget, BoxLayout } from "@phosphor/widgets";
import { Observable } from "rxjs";
import { JSONObject } from "@phosphor/coreutils";
import { nbformat } from "@jupyterlab/coreutils";
import { filter, takeWhile } from "rxjs/operators";
import { IRenderMimeRegistry, MimeModel, renderText } from "@jupyterlab/rendermime";
import { ISanitizer } from "@jupyterlab/apputils";

export class DisplayHandle extends Widget {
    // re-types the definition in Widget#layout
    public readonly layout: BoxLayout;
    public readonly name: string;
    private readonly registry: IRenderMimeRegistry;
    private readonly sanitizer: ISanitizer;

    constructor({ name, registry, onUpdated, node, sanitizer }: DisplayHandle.IOptions) {
        super({ node });
        this.layout = new BoxLayout();
        this.registry = registry;
        this.name = name;
        this.sanitizer = sanitizer;
        onUpdated.pipe(
            filter(i => i.name === name),
            takeWhile(() => !this.isDisposed)
        ).subscribe((i) => this.render(i));
    }

    public async render(msg: DisplayHandle.IRenderData) {
        for (const item of this.layout.widgets) {
            item.dispose();
        }

        const mimeType = this.registry.preferredMimeType(msg.data || {}, "any");
        if (mimeType == null) {
            return Promise.reject("Cannot figure out how to render display data");
        }
        const renderer = this.registry.createRenderer(mimeType);

        const model = new MimeModel({
            data: msg.data || undefined,
            metadata: msg.metadata || undefined,
            trusted: true
        });

        try {
            await renderer.renderModel(model);
            this.layout.addWidget(renderer);
        } catch (e) {
            console.warn("Could not render handle");
            console.warn(e);
            const host = new Widget();
            await renderText({
                host: host.node,
                source: e,
                sanitizer: this.sanitizer
            });
            this.layout.addWidget(host);
        }

    }
}

export namespace DisplayHandle {
    export interface IRenderData extends JSONObject {
        data: nbformat.IMimeBundle;
        metadata: JSONObject;
        name: string;
    }

    export interface IOptions {
        name: string;
        onUpdated: Observable<DisplayHandle.IRenderData>;
        registry: IRenderMimeRegistry;
        sanitizer: ISanitizer;
        node?: HTMLElement;
    }

    export const MIME_TYPE = "application/vnd.maven.display-handle+json";
}
