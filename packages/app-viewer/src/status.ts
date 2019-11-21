import { Widget } from "@phosphor/widgets";

export const enum ApplicationStatus {
    Uninitialized = "uninitialized",
    Idle = "idle",
    Busy = "busy",
    Error = "error"
}

export class StatusToolbar extends Widget {
    private readonly kernelStatus: HTMLElement;
    private readonly overlay: HTMLElement | undefined;

    constructor(options: StatusToolbar.Options) {
        super();
        this.addClass("maven_toolbar");
        this.addClass("state_kernel_uninitialized");

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

    public setKernelStatus(status: ApplicationStatus) {
        this.removeClass("state_kernel_busy");
        this.removeClass("state_kernel_error");
        this.removeClass("state_kernel_uninitialized");
        if (this.overlay != null) {
            switch (status) {
                case ApplicationStatus.Busy:
                    break; // already handled by setKernelLanguage
                case ApplicationStatus.Error:
                    this.overlay.innerText = `Failed to Execute!`;
                    this.overlay.classList.add("m-StatusToolbar-overlay__error");
                    break;
                case ApplicationStatus.Idle:
                    document.body.removeChild(this.overlay); // the overlay's job is done
            }
        }
        switch (status) {
            case ApplicationStatus.Idle:
                return;
            case ApplicationStatus.Uninitialized:
                this.addClass("state_kernel_uninitialized");
                return;
            case ApplicationStatus.Busy:
                this.addClass("state_kernel_busy");
                return;
            case ApplicationStatus.Error:
                this.addClass("state_kernel_error");
        }
    }
}

export namespace StatusToolbar {
    export interface Options {
        showOverlay: boolean;
    }
}
