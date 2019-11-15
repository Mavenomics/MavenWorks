import { JupyterFrontEnd } from "@jupyterlab/application";
import { ViewerShell } from "./shell.js";

export class Viewer extends JupyterFrontEnd<ViewerShell> {
    name = "MavenWorks Viewer";
    namespace = "mavenworks-viewer";
    version = "0.1.2";
}
