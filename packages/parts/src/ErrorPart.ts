import { Part } from "./Part";
import { PartSerializer } from "./PartSerializer";
import { Converters, JSONObject, Types } from "@mavenomics/coreutils";

/**
 * A framework class for an unknown part. If a dashboard referenced parts that
 * are not available in this install (such as, it referenced a UDP that got
 * renamed), then the part is replaced with this error part.
 */
export class ErrorPart extends Part {
    private readonly originalName: string;
    private _originalModel?: PartSerializer.ISerializedPart;

    constructor(args: Part.IOptions, originalPartName?: string) {
        super(args);
        this.originalName = originalPartName || "ErrorPart";
        this.node.innerHTML = `
            <h3>Error: Unrecognized Part "${this.originalName}"</h3>
            <p>Don't save this notebook to prevent data loss</p>
        `;
        this.node.style.color = "var(--jp-error-color0, red)";
        this.node.style.overflowY = "scroll";
    }

    public get typeName() { return this.originalName; }
    public get originalModel() { return this._originalModel; }

    public setModel(model?: PartSerializer.ISerializedPart) {
        if (model == null) {
            return;
        }
        this._originalModel = model;
        // use this as a clue to what the options were
        this.node.innerHTML += `
            <span>Options:</span>
            <ul>
            ${Object.keys(model.options).map(optName => {
                const opt = model.options[optName];
                let val;
                let type = Types.Any;
                if (opt && opt.hasOwnProperty("typeName")) {
                    val = Converters.deserialize(opt as JSONObject);
                    type = Types.findType((opt as JSONObject).typeName) || Types.Any;
                } else if (opt != null) {
                    val = (opt as any).type + "Binding: " + (opt as any).expr;
                    type = Types.String;
                }
                return `
                    <li><code>${optName}=${Converters.serialize(val, type)}</code></li>
                `;
            }).join("")}
            </ul>
        `;
    }

    public async initialize() { }
    public async render() { }
}
