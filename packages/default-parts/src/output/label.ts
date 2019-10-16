import { Types } from "@mavenomics/coreutils";
import { Widget } from "@phosphor/widgets";
import { Part, OptionsBag } from "@mavenomics/parts";

export class LabelPart extends Part {
    public static GetMetadata() {
        const metadata = super.GetMetadata();

        metadata.description = "Display a value or statistic, with a caption to contextualize it";
        metadata.remarks = `
Sometimes you may want to echo a global, selection, or some other state from a
dashboard. Or maybe you want to display a statistic or result. LabelParts are
convenient for this.

> #### Note
>
> The LabelPart Value is typed as _\`Any\`_, which means that the inline editor
> on the Part Properties dialog won't accept an unquoted string. Use quotes if
> you intend to display a static string as the value.
`;

        metadata.addOption("Value", Types.Any, null);
        metadata.addOption("Caption", Types.String, "");

        return metadata;
    }

    private content = new Widget();


    public async initialize() {
        this.content.addClass("m-LabelPart");
        this.layout.addWidget(this.content);
    }

    public async render(bag: OptionsBag) {
        const caption = "" + bag.get("Caption");
        const value = "" + bag.get("Value");
        this.content.node.innerHTML = `<p style="text-align:center;">
            ${caption}
        </p>
        <h1 style="text-align:center;">${value}</h1>`;
    }
}
