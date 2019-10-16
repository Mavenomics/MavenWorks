import { docProviderPlugin, IHelpDocProvider } from "./docprovider";
import { browserPlugin } from "./plugin";
import { helpPartsPlugin, layoutPlugin } from "./help-generator";

export { IHelpDocProvider };

export default [
    docProviderPlugin,
    browserPlugin,
    helpPartsPlugin,
    layoutPlugin,
];
