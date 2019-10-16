import { IPlugin } from "@phosphor/application";
import { Token } from "@phosphor/coreutils";
import { renderMarkdown, ILatexTypesetter, IRenderMime, IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { defaultSanitizer } from "@jupyterlab/apputils";
import { AsyncTools } from "@mavenomics/coreutils";
import { Observable, Subject } from "rxjs";

export const IHelpDocProvider = new Token<IHelpDocProvider>("MavenWorks Help Document Provider");

export interface IHelpDocProvider {

    onChanged: Observable<void>;

    /** Return the metadata about all the documents. */
    getMetadata(): ReadonlyArray<DocHelpers.IDocMetadata | null>;
    /** Return the source of a single document. */
    getDocument(titleOrIdx: string | number): string;

    addDocument(doc: string): Promise<void>;
}

export class DefaultHelpDocProvider implements IHelpDocProvider {
    public static async Create(
        latexTypesetter: ILatexTypesetter | null,
        linkHandler: IRenderMime.ILinkHandler | null,
        resolver: IRenderMime.IResolver | null,
    ) {
        // Wait a tick to make sure the MQL highlighting mode is loaded
        await AsyncTools.wait();
        return new DefaultHelpDocProvider([], [], latexTypesetter, linkHandler, resolver);
    }

    onChangedSrc$ = new Subject<void>();
    onChanged = this.onChangedSrc$.asObservable();

    private readonly documents: Array<string>;
    private readonly metadata: Array<Record<string, string> | null>;
    private readonly latexTypesetter: ILatexTypesetter | null;
    private readonly linkHandler: IRenderMime.ILinkHandler | null;
    private readonly resolver: IRenderMime.IResolver | null;

    protected constructor(
        renderedDocs: string[],
        metadata: any[],
        latexTypesetter: ILatexTypesetter | null,
        linkHandler: IRenderMime.ILinkHandler | null,
        resolver: IRenderMime.IResolver | null
    ) {
        this.documents = renderedDocs;
        this.metadata = metadata;
        this.latexTypesetter = latexTypesetter;
        this.linkHandler = linkHandler;
        this.resolver = resolver;
    }

    public getMetadata() { return this.metadata; }

    public getDocument(titleOrIdx: string | number) {
        if (typeof titleOrIdx === "number") {
            return this.documents[titleOrIdx];
        }
        const idx = this.metadata.findIndex(i => i && i.title === titleOrIdx);
        if (idx === -1) {
            throw Error("Document not found: " + titleOrIdx);
        }
        return this.documents[idx];
    }

    public async addDocument(doc: string): Promise<void> {
        const source = DocHelpers.StripFrontMatter(doc);
        const host = document.createElement("div");

        const metadata = DocHelpers.GetFrontMatter(doc);
        await renderMarkdown({
            source,
            host,
            latexTypesetter: this.latexTypesetter,
            linkHandler: this.linkHandler,
            resolver: this.resolver,
            trusted: true,
            shouldTypeset: true,
            sanitizer: defaultSanitizer,
        });

        // strip out any internal anchor links, since they mess with the
        // hash. TODO: Use a Link Resolver for this?
        host.querySelectorAll("a.jp-InternalAnchorLink")
            .forEach(i => i.remove());

        const renderHtml = host.innerHTML;
        this.metadata.push(metadata);
        this.documents.push(renderHtml);
        this.onChangedSrc$.next();
    }
}

export namespace DocHelpers {
    export type IDocMetadata = Readonly<Record<string, string>>;
    /**
     * Pull out the frontmatter from a MD source and return a k-v map.
     *
     * NOTE! This does not support YAML, it only fakes it by pulling out
     * simple key-values. Use a front-matter parser if you need true YAML
     * support.
     *
     * If this function couldn't parse the front-matter or the document didn't
     * have one, then this will return null.
     *
     * @export
     * @param src The markdown source file
     * @returns A kv map of front-matter params, or null.
     */
    export function GetFrontMatter(src: string): IDocMetadata | null {
        const frontMatter = /^---[\r\n]+([\s\S]*)[\r\n]+---/i.exec(src);
        if (frontMatter == null) return null;
        try {
            const lines = frontMatter[1].split("\n");
            const obj: Record<string, string> = {};
            for (const line of lines) {
                const [name, val] = line.split(":");
                obj[name.trim()] = val.trim();
            }
            return Object.freeze(obj);
        } catch (err) {
            console.warn("Failed to parse document front-matter", err);
            return null;
        }
    }

    export function StripFrontMatter(src: string): string {
        return src.replace(/^---[\r\n]+[\s\S]*[\r\n]+---/i, "");
    }
}

export const docProviderPlugin: IPlugin<unknown, IHelpDocProvider> = {
    id: "mavenworks:help-doc-provider",
    autoStart: true,
    provides: IHelpDocProvider,
    optional: [
        ILatexTypesetter,
        IRenderMimeRegistry
    ],
    activate: async (_app,
        typesetter?: ILatexTypesetter,
        rendermime?: IRenderMimeRegistry
    ) => {
        return await DefaultHelpDocProvider.Create(
            typesetter || null,
            (rendermime && rendermime.linkHandler) || null,
            (rendermime && rendermime.resolver) || null
        );
    }
};
