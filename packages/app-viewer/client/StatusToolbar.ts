import { Widget } from "@phosphor/widgets";
import { IClientSession } from "@jupyterlab/apputils";

export const enum KernelStatus {
    Idle,
    Busy,
    Error
}

export class StatusToolbar extends Widget {
    private readonly opts: StatusToolbarOptions;
    private readonly kernelStatus: HTMLElement;
    private readonly overlay: HTMLElement | undefined;

    constructor(options: StatusToolbarOptions) {
        super();
        this.opts = options;
        this.addClass("maven_toolbar");

        const title = document.createElement("span");
        title.innerText = "MavenWorks Dashboard Viewer";
        this.node.appendChild(title);
        const statusbar = document.createElement("span");
        statusbar.classList.add("kernel_status");
        this.kernelStatus = document.createElement("code");
        this.kernelStatus.innerText = "Not Connected";
        statusbar.appendChild(this.kernelStatus);
        this.node.appendChild(statusbar);

        if (!!options.showOverlay) {
            const overlay = this.overlay = document.createElement("div");
            overlay.classList.add("m-StatusToolbar-Overlay");
            overlay.innerText = "Initializing...";
            document.body.appendChild(overlay);
        }
    }

    public setKernelLanguage(languageName: string) {
        this.kernelStatus.innerText = languageName;
        if (this.overlay != null) {
            this.overlay.innerText = `Executing... (${languageName})`;
        }
    }

    public setKernelStatus(status: KernelStatus) {
        this.removeClass("state_kernel_busy");
        this.removeClass("state_kernel_error");
        if (this.overlay != null) {
            switch (status) {
                case KernelStatus.Busy:
                    break; // already handled by setKernelLanguage
                case KernelStatus.Error:
                    this.overlay.innerText = `Failed to Execute!`;
                    this.overlay.classList.add("m-StatusToolbar-overlay__error");
                    break;
                case KernelStatus.Idle:
                    document.body.removeChild(this.overlay); // the overlay's job is done
            }
        }
        switch (status) {
            case KernelStatus.Idle:
                return;
            case KernelStatus.Busy:
                this.addClass("state_kernel_busy");
                return;
            case KernelStatus.Error:
                this.addClass("state_kernel_error");
        }
    }
}

export interface StatusToolbarOptions {
    clientSession: IClientSession;
    showOverlay: boolean;
}
