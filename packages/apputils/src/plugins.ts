import { Token } from "@phosphor/coreutils";
import { IDashboardPlugin } from "./interfaces";
import { IUserManager, HttpUserManager } from "./user";
import { IConfigManager, HttpConfigManager } from "./config";
import { IUrlManager, UrlManager } from "./url";
import { PageConfig, URLExt } from "@jupyterlab/coreutils";

export type IConfigUrl = string | null;
export const IConfigUrl = new Token<string>("MavenWorks Config Server URL");

const configUrlPlugin: IDashboardPlugin<IConfigUrl> = {
    id: "@mavenomics/apputils:config-url",
    autoStart: true,
    provides: IConfigUrl,
    activate: () => PageConfig.getOption("configUrl")
};

const userPlugin: IDashboardPlugin<IUserManager> = {
    id: "@mavenomics/apputils:user-plugin",
    autoStart: true,
    provides: IUserManager,
    requires: [IConfigUrl],
    activate: (_app, cfg: IConfigUrl) => {
        return new HttpUserManager(URLExt.join(cfg || "/", ".."));
    }
};

const configPlugin: IDashboardPlugin<IConfigManager> = {
    id: "@mavenomics/apputils:config-plugin",
    autoStart: true,
    provides: IConfigManager,
    requires: [IConfigUrl],
    activate: (_app, cfg: IConfigUrl) => {
        return new HttpConfigManager(cfg || "/");
    }
};

const urlPlugin: IDashboardPlugin<IUrlManager> = {
    id: "@mavenomics/apputils:url-manager",
    autoStart: true,
    provides: IUrlManager,
    requires: [],
    activate: (_app) => {
        const baseUrl = PageConfig.getBaseUrl();
        return new UrlManager(baseUrl);
    }
};

const pluginList = [
    configUrlPlugin,
    configPlugin,
    urlPlugin
] as IDashboardPlugin<unknown>[];

if (PageConfig.getOption("enableUsers") === "true") {
    pluginList.push(userPlugin);
}

export const plugins = pluginList;
