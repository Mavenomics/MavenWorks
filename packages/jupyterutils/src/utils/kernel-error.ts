import { defaultSanitizer } from "@jupyterlab/apputils";
import { renderText } from "@jupyterlab/rendermime";

export class KernelError extends Error {
    /** Create a new kernel error with a pretty stacktrace */
    public static async Create(traceback: string | string[], kernelDisplayName: string) {
        if (Array.isArray(traceback)) {
            traceback = traceback.join("\n");
        }
        const err = new KernelError(traceback, kernelDisplayName);
        await err._onRendered;
        return err;
    }

    public traceback: string;
    public prettyTraceback: string;
    protected _onRendered: Promise<void>;

    constructor(traceback_raw: string, kernel_lang: string) {
        super("Error in " + kernel_lang + " code");
        const host = document.createElement("p");
        this.traceback = traceback_raw;
        this.prettyTraceback = "";
        this._onRendered = renderText({
            source: traceback_raw,
            host,
            sanitizer: defaultSanitizer
        }).then(() => {
            this.prettyTraceback = host.innerHTML;
        });
    }
}
