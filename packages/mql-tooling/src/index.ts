import { CodeMirrorEditor } from "@jupyterlab/codemirror";
import { IPlugin, Application } from "@phosphor/application";
import { Widget } from "@phosphor/widgets";
import * as CodeMirror from "codemirror";
import { getAvailableFunctions } from "./mql-linter";
import "./mql-syntax-highlighter";
import "./jsmql-linter";

const plugin = {
    id: "@mavenomics/mql-tooling:plugin",
    autoStart: true,
    activate: (app) => {
        // TODO: Hook MQL helpers into some CodeMirror service
        // Also setup GoToDef where available
        CodeMirrorEditor.addCommand("gotodef-mql", async (cm: CodeMirror.Editor) => {
            if (!app.commands.hasCommand("@mavenomics/help:go-to-doc")) {
                return; // No help browser on this deployment
            }
            const funcs = await getAvailableFunctions();
            const cur = cm.getDoc().getCursor();
            let token = cm.getTokenAt(cur);
            if (funcs.findIndex(i => i.name === token.string) === -1) {
                // either not an MQL function, or not a valid one
                return;
            }
            app.commands.execute("@mavenomics/help:go-to-doc", {docPath: `/Reference/MQL/${token.string}`});
        });
    }
} as IPlugin<Application<Widget>, void>;

export default plugin;
