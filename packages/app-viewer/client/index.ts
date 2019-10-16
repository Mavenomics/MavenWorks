import "./public-path";
import "../styles/index.css";
import { MainApp } from "./main";
import { Widget } from "@phosphor/widgets";
import { HoverManager } from "@mavenomics/ui";
import { PageConfig, URLExt } from "@jupyterlab/coreutils";

(function() {
    const isHub = PageConfig.getOption("hub_user") !== "";
    if (!isHub) return; // no correction to make
    const oldUrl = window.location.href;
    const redirect = URLExt.join(
        PageConfig.getOption("hub_host"),
        PageConfig.getOption("hub_prefix"),
        "user-redirect"
    );
    const newUrl = oldUrl.replace(
        PageConfig.getBaseUrl(),
        ""
    );
    window.history.replaceState(null, "", URLExt.join("/", redirect, newUrl));
})();

const spinny = document.getElementById("loadingSpinny")!;

Widget.attach(HoverManager.GetManager(), document.body);
const main = new MainApp();
const node = document.getElementsByTagName("MainApp")[0] as HTMLElement;
Widget.attach(main, node);
spinny.remove();
window.addEventListener("resize", () => {
    main.update();
});
