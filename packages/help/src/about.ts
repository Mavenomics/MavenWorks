import { Widget } from "@phosphor/widgets";
import { Interactions, HoverManager } from "@mavenomics/ui";

const _BUILD = process.env.BUILD_NUMBER || "develop";
const _BRANCH = process.env.GIT_BRANCH || "develop";
const _COMMIT = process.env.GIT_COMMIT || "develop";
const _BUILT = +(process.env.BUILD_DATE || "NaN");
// Default to true, force builds to be explicit about disabling GPL notice
// Note that you should only do this with explicit permission and a licensing
// agreement.
const _USE_GPL = (process.env.USE_GPL || "true").toLocaleLowerCase() !== "false";

const text = `
<h3>MavenWorks &copy 2019 Mavenomics</h3>

${_USE_GPL ? `<p>
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
</p>
<p>
This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.
</p>
<p>
You should have received a copy of the GNU General Public License
along with this program.  If not, see
&lt;<a href="https://www.gnu.org/licenses/">https://www.gnu.org/licenses</a>&gt;.
</p>` : `<p>All rights reserved.</p>`}

<h4>Build Info</h4>

<p>Built on ${(new Date(_BUILT)).toLocaleDateString()}</p>
<br />
<br />
Build #<code>${_BUILD}</code>
<br />
Branch: <code>${_BRANCH}</code>
<br />
Commit: <code>${_COMMIT.substr(0, 5)}</code>
<br />
`;

export function openAbout() {
    const hover = HoverManager.GetManager();
    const widget = new Widget();
    widget.title.label = "About MavenWorks";
    widget.node.innerHTML = text;
    const button = new Interactions.Button();
    button.onClicked.subscribe(async () => {
        // I'd love to use `await import()` here, but TS will actually transform
        // that into a bare `require` (which Webpack can't split off), thus
        // including the 1mb license monstrosity in the bundle directly.
        // Once we're able to move to ES6 modules (currently waiting on better
        // Jest support for them), then we can change this to use the nicer
        // import() syntax.
        (require as any).ensure(
            ["raw-loader!../licenses"],
            (require: RequireResolve) => {
                const toDisplay = new Widget({node: document.createElement("pre")});
                toDisplay.node.style.overflow = "scroll";
                toDisplay.node.innerText = (require("raw-loader!../licenses") as any).default;
                hover.openDialog({
                    hover: toDisplay,
                    owner: widget,
                    width: 630,
                    height: 500
                });
            }
        );
    });
    button.label = "Third Party Software";
    widget.node.appendChild(button.node);
    return hover.openDialog({
        hover: widget,
        owner: new Widget(),
        width: 400,
        height: 200
    }).onClosed.then(() => {
        button.dispose();
    });
}
