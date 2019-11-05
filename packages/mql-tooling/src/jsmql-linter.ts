import { getCommentLine, getGlobalsFromComment } from "@mavenomics/bindings";
import { TableHelper } from "@mavenomics/table";
import * as CodeMirror from "codemirror";
import { JSHINT } from "jshint/dist/jshint.js";
if (window)
    (<any>window).JSHINT = JSHINT;
import "codemirror/addon/lint/javascript-lint";
import "./javascript-hint";

//Todo: InputWidgets.Code should use a service to generate the codemirror config.
//That way the following code can be registered with the service instead of using this InitHook hack.
//Essentially making InputWidgets.Code pluginable.
function getJavaScriptReferencedGlobals(text: any): string[] | null {
    const comment = getCommentLine(text, null);
    return comment != null ? getGlobalsFromComment(comment) : null;
}
//Todo: Subscribe to the globals service and only update when globals are added/removed.
function updateGlobalsCompletion(cm: any) {
    const options = cm.options;
    if (options) {
        let hintOpts = options.hintOptions;
        if (hintOpts && hintOpts.globalScope && hintOpts.additionalContext) {
            const globalsService = options && options.context ? options.context.globals : null;
            const allGlobals = globalsService ? Array.from(globalsService).map((g: any) => g.name) : [];
            //Try to find explicitly referenced globals.
            //If there are no explicitly referenced globals then we show all globals.
            const globals = getJavaScriptReferencedGlobals(cm.getDoc().getValue()) || allGlobals;
            let globalsObj = globals.reduce((o: any, n: string) => (o[n] = "", o), {});
            hintOpts.globalScope.globals = globalsObj;
            hintOpts.additionalContext.globals = globalsObj;
        }
    }

}
CodeMirror.defineInitHook((cm: CodeMirror.Editor) => {
    CodeMirror.on(cm, "optionChange", (cm: any, option: any) => {
        if (option === "mode") {
            if (cm.getOption("mode") === "text/x-jsmql" && cm.options && cm.options.hintOptions) {
                cm.options.hintOptions.esversion = 9; //Enable es9. This is for await and mql templates support
                //This gives us autocomplete for TableHelper.<x>
                cm.options.hintOptions.additionalContext = { TableHelper: TableHelper };

                //Copy window so that we can add globals
                let windowClone: any = {};
                for (let key of Reflect.ownKeys(window)) {
                    windowClone[key] = (<any>window)[key];
                }

                //Add TableHelper, RunMql, etc
                cm.options.hintOptions.globalScope = Object.assign({}, windowClone, {
                    TableHelper: TableHelper,
                    RunMql: function () { },
                    mql: "",
                    expr: function () { },
                    ImportScriptFromUrl: function () { },
                });

                updateGlobalsCompletion(cm);
                cm.on("change", updateGlobalsCompletion);
            } else {
                cm.off("change", updateGlobalsCompletion);
            }
        }
    });

});
