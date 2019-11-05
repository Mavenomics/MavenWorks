import { IPlugin, Application } from "@phosphor/application";
import { Widget } from "@phosphor/widgets";
import "./mql-syntax-highlighter";
import "./mql-linter";
import "./jsmql-linter";

const plugin = {
    id: "@mavenomics/mql-tooling:plugin",
    autoStart: true,
    activate: (app) => {
        // TODO: Hook MQL helpers into some CodeMirror service
        // Also setup GoToDef where available
    }
} as IPlugin<Application<Widget>, void>;

export default plugin;
