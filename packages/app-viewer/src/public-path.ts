/**
 * Set the public path for Webpack in dependency loading
 *
 * We need to do this in a separate module to ensure that imports that depend
 * on it don't get hoisted above where we set this variable (otherwise, their
 * dynamic dependencies wouldn't load).
 */
import { PageConfig, URLExt } from "@jupyterlab/coreutils";

// Set the public path for async-loaded deps, like the worker bundle.
// This is done using a magical ambient webpack runtime free variable (say that 5x fast!)
// https://webpack.js.org/configuration/output/#outputpublicpath
// @ts-ignore
__webpack_public_path__ = URLExt.join(PageConfig.getBaseUrl(), "viewer/static/");
