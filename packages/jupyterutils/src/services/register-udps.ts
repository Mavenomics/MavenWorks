import { PartFactory, JavascriptEvalPart } from "@mavenomics/parts";
import { PageConfig, URLExt, PathExt } from "@jupyterlab/coreutils";
import { showDialog, Dialog } from "@jupyterlab/apputils";
import { Widget } from "@phosphor/widgets";

export async function registerUDPs(factory: PartFactory, kernelPath?: string) {
    const requestUrl = URLExt.join(PageConfig.getBaseUrl(), "/serverconfig/");
    let queryUrl = "";
    if (kernelPath != null) {
        queryUrl = URLExt.objectToQueryString({
            "path": PathExt.dirname(kernelPath)
        });
    }
    try {
        const result = await fetch(requestUrl + queryUrl)
            .then(res => res.json());
        for (const part of result["objs"]) {
            // the API returns the path as well
            // TODO: think about how to clean that up
            const wrapper = JavascriptEvalPart.generateWrapper(part, part["path"]);
            factory.registerPart(wrapper.name, wrapper);
        }
    } catch (err) {
        console.error("Failed to connect to config, UDPs weren't registered");
        console.error(err);
        const body = new Widget();
        body.node.innerHTML = `
<h4>What does this mean?</h4>

<p>
    User Defined Parts are <code>.part</code> files that describe a simple sort
    of Part. MavenWorks must try to contact the server to know where these files
    are, but if it fails then you will not be able to use UDPs. You can dismiss
    this error, but some dashboards may not work as intended.
</p>

<h4>How can I resolve this error?</h4>

<p>
    This error typically occurs because the server could not be contacted.
    This may happen if you do not have the serverextension setup, or did not
    restart your Jupyter server after installing it. Try the following steps:
</p>
<ul>
    <li>Verify that your Jupyter server is still online by refreshing the page</li>
    <li>Verify that the Serverextension is still setup with
    <code>jupyter serverextension enable --py mavenworks.server</code></li>
    <li>Restart your Jupyter server</li>
</ul>
<p>
    If these don't work, please let us know by filing an issue
    <a href="https://github.com/Mavenomics/MavenWorks/issues/new"
       style="color:blue;text-decoration:underline">on GitHub.</a>
</p>`;
        return showDialog({
            title: "Failed to fetch UDPs",
            body,
            buttons: [Dialog.okButton({caption: "Dismiss"})]
        });
    }
}
