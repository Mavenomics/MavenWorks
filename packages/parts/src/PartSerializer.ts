import { JSONObject, Converters } from "@mavenomics/coreutils";
import { OptionsBag } from "./OptionsBag";
import { Part } from "./Part";
import { ErrorPart } from "./ErrorPart";
import { isEqual } from "lodash";
import Binding = OptionsBag.Binding;

export namespace PartSerializer {
    export const MIMETYPE = "application/vnd.maven.part+json";

    /** Convert the given part and options bag to JSON
     *
     * #### Notes
     *
     * No serialization is done for ErroParts. The original model, if available,
     * is returned instead. This is to try and prevent data loss.
     */
    export function toJson(part: Part, optionsBag: OptionsBag): ISerializedPart {
        // return the original model
        if (part instanceof ErrorPart) {
            return part.originalModel || {
                name: part.typeName,
                id: part.uuid,
                options: {}
            };
        }
        const options: ISerializedPartOptions = {};
        const defaults = (part.constructor as typeof Part).GetMetadata();
        for (const defaultOption of defaults) {
            const opt = optionsBag.getMetadata(defaultOption.name);
            if (opt.binding != null) {
                options[opt.name] = opt.binding!;
            } else if (!isEqual(opt.value, defaultOption.value)) {
                options[opt.name] = Converters.serialize(opt.value, opt.type);
            } else {
                // skip, since the option is the default.
            }
        }
        const name = part.getName();
        const id = part.uuid;
        return {
            name,
            id,
            options
        };
    }

    export interface ISerializedPart {
        options: ISerializedPartOptions;
        name: string;
        id: string;
    }

    export interface ISerializedPartOptions {
        [name: string]: JSONObject | Binding | null;
    }
}
