/**
 * Wrappers and proxies for JupyterLab services
 */

import { default as docmanager } from "./docmanager";
import { default as rendermimePlugin } from "@jupyterlab/rendermime-extension";
import { default as codemirrorPlugin } from "@jupyterlab/codemirror-extension";
import { JupyterFrontEndPlugin } from "@jupyterlab/application";

const plugins = [
    rendermimePlugin,
    codemirrorPlugin,
    docmanager
] as JupyterFrontEndPlugin<unknown>[];

export default plugins;
