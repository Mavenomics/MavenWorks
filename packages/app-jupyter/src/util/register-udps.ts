import { PartFactory, JavascriptEvalPart } from "@mavenomics/parts";
import { PageConfig, URLExt, PathExt } from "@jupyterlab/coreutils";

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
        throw err;
    }
}
