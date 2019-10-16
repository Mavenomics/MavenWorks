/**
 * Created by nick on 1/22/2015.
 */

import * as $ from "jquery";
import { IGridContext } from "../interfaces";

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

    selector.on({
        mouseenter: function (event) {
            webMavenHost.CloseHover();

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

            var bounds = $(selector)[0].getBoundingClientRect() as DOMRect;

            webMavenHost.OpenHover(tooltip[0].outerHTML, bounds.right + 1, bounds.y, options.width, options.height);
        },

        mouseleave: function (event) {
            webMavenHost.CloseHover();
        },
        dblclick: function(event) {
            //Todo: Popout
        }
    });

    function disable () {
        selector.off("mousemove");
        selector.off("mouseout");
    }

    return {off: disable, disable: disable};
};