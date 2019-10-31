import { ReactWrapperWidget, ListBox, HoverManager } from "@mavenomics/ui";
import { Widget } from "@phosphor/widgets";
import * as React from "react";
import { Token } from "@phosphor/coreutils";
import { MavenWorksPlugin } from "./application";
import { IConfigManager } from "@mavenomics/apputils";
import { AsyncTools } from "@mavenomics/coreutils";

export interface IConfigBrowser extends Widget {
    renameDashboard(): void;
    deleteDashboard(): Promise<void>;
    getValue(): string | null;
}

export interface IConfigBrowserFactory {
    create(): IConfigBrowser;
}

export const IConfigBrowserFactory = new Token<IConfigBrowserFactory>("Config Browser");

export const configBrowserPlugin: MavenWorksPlugin<IConfigBrowserFactory> = {
    id: "configBrowser",
    requires: [IConfigManager],
    provides: IConfigBrowserFactory,
    activate: (_app, configManager: IConfigManager) => {
        return new ConfigBrowserFactory(configManager);
    }
};


class ConfigBrowserFactory {
    constructor(private configManager: IConfigManager) {}

    create() {
        return new ConfigBrowser(this.configManager);
    }
}

class ConfigBrowser extends ReactWrapperWidget implements IConfigBrowser {
    private configManager: IConfigManager;
    private dashboardNames: string[] = [];
    private selectedKey: string | null = null;
    private isEditing = false;

    constructor(configManager: IConfigManager) {
        super();
        this.configManager = configManager;
        this.addClass("m-ConfigBrowser");
        this.getDashboardNames();
    }

    public getValue() {
        return this.selectedKey;
    }

    public renameDashboard() {
        this.isEditing = true;
        this.update();
    }

    public async deleteDashboard() {
        if (this.selectedKey == null) return;
        try {
            await this.configManager.deleteDashboard(this.selectedKey);
            await AsyncTools.wait();
            await this.getDashboardNames();
        } catch (err) {
            HoverManager.Instance!.openErrorDialog(err);
        }
    }

    protected render() {
        return (<ListBox items={this.dashboardNames.map(i => ({key: i, label: i.slice(1)}))}
            selectedKey={this.selectedKey}
            onSelect={(key) => {
                this.selectedKey = key;
                this.update();
            }}
            isEditing={this.isEditing}
            onEdit={this.handleDashboardEdited.bind(this)}
        />);
    }

    protected onActivateRequest() {
        this.getDashboardNames();
    }

    private async getDashboardNames() {
        try {
            const paths = await this.configManager.getAllDashboardNames();
            this.dashboardNames = [...paths].sort();
            this.update();
        } catch (err) {
            HoverManager.Instance!.openErrorDialog(err);
        }
    }

    private async handleDashboardEdited(key: string, newLabel: string) {
        if (key === newLabel) {
            this.isEditing = false;
            return;
        }
        if (newLabel.includes("/")) {
            return HoverManager.GetManager().openErrorDialog(new Error("Names cannot contain slashes ('/')"));
        }
        try {
            await this.configManager.renameDashboard(key, newLabel);
            await AsyncTools.wait();
        } catch (err) {
            HoverManager.Instance!.openErrorDialog(err);
        }
        await this.getDashboardNames();
        this.isEditing = false;
        this.selectedKey = newLabel;
    }
}
