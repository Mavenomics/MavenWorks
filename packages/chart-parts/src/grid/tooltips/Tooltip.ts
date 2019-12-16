/**
 * Created by nick on 1/22/2015.
 */

import * as $ from "jquery";
import { IGridContext } from "../interfaces";
import { HoverManager } from "@mavenomics/ui";
import { Widget } from "@phosphor/widgets";

// TODO: options typing
export function Tooltip(selector: JQuery, options: any, webMavenHost: IGridContext) {
    var defaults = {
        html: undefined,
        htmlMode: "clear", // clear, append, prepend
        css: Object.assign({
            backgroundColor: "white",
            color: "black",
            // display: "none",
            padding: 0,
            fontFamily: "sans-serif",
            fontSize: "13px",
            pointerEvents: "none",
        }, options.css),
        show: null,
        hide: null,
        move: null,
        hideDelay: 0,
        showDelay: 0,
        height: -1,
        width: 400
    };

    options = Object.assign(defaults, options);

    var tooltip = $(document.createElement("div"));

    selector.off("mouseenter");
    selector.off("mouseleave");

    function makeTooltip() {
        if (options.width > -1)
            tooltip.width(options.width);

        if (options.height > -1)
            tooltip.height(options.height);

        var optionsHtml = typeof options.html === "function" ? options.html(selector, tooltip) : options.html;
        if (options.html) {
            switch (options.htmlMode) {
                case "clear":
                    tooltip.html(optionsHtml);
                    break;

                case "append":
                    tooltip.append(optionsHtml);
                    break;

                case "prepend":
                    tooltip.prepend(optionsHtml);
                    break;
            }
        }
        tooltip.css($.extend(options.css, {
            position: "absolute",
            zIndex: 9999999
        }));
    }

    let model: HoverManager.HoverViewModel | undefined;
    const mgr = HoverManager.GetManager();

    selector.on({
        mouseenter: function (event) {
            webMavenHost.CloseHover();
            if (model) mgr.closeHover(model, { disposeAtExit: true });
            makeTooltip();
            const owner = new Widget({node: $(selector)[0]});
            const hover = new Widget({node: tooltip[0]});
            hover.disposed.connect(i => owner.dispose());
            model = mgr.openHover({
                    hover,
                    mode: "tooltip",
                    offsetMode: "relative",
                    owner,
                    x: 10,
                    y: 10,
                    width: options.width,
                    height: options.height
                });
        },
        dblclick: function(event) {
            webMavenHost.CloseHover();
            if (model) mgr.closeHover(model, { disposeAtExit: true });
            makeTooltip();
            const owner = new Widget({node: $(selector)[0]});
            const hover = new Widget({node: tooltip[0]});
            hover.disposed.connect(i => owner.dispose());
            mgr.openDialog({
                hover,
                owner,
                width: options.width + 10,
                height: options.height + 50
            });
        }
    });

    function disable () {
        selector.off("mouseenter");
        selector.off("dblclick");
    }

    return {off: disable, disable: disable};
};