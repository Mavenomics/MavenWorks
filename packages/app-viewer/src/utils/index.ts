/**
 * Wrappers and proxies for JupyterLab services
 */

import { default as docmanager } from "./docmanager";
import { default as ipywidgets } from "./ipywidgets";
import { default as rendermimePlugin } from "@jupyterlab/rendermime-extension";
import { default as codemirrorPlugin } from "@jupyterlab/codemirror-extension";
import { JupyterFrontEndPlugin } from "@jupyterlab/application";

const plugins: JupyterFrontEndPlugin<unknown>[] = [
    rendermimePlugin,
    // We only want the services plugin
    codemirrorPlugin.find(i => i.id === "@jupyterlab/codemirror-extension:services")!,
    docmanager,
    ipywidgets,
];

export default plugins;
