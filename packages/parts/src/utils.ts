import { Part } from "./Part";

/**
 * Utilities for Parts that accept and work with tables.
 *
 * Often, these parts only work with a single option as their input table, and
 * it is this option that will be most frequently edited by users. To speed this
 * up, MavenWorks offers a shortcut UX that makes a few assumptions about the part:
 *
 * 1. The part has an option named "Input Table"
 * 2. That option is usually bound
 * 3. That option is the 'dominant' option- a single option that the rest of
 *    the part revolves around.
 *
 * If these 3 assumptions hold, then MavenWorks can speed up user interactions and
 * ease death-by-a-thousand-clicks.
 *
 * The following 'shortcuts' are provided:
 *
 *  - A popup binding editor, with a type dropdown, summonable with Accel E, Q
 *  - A localstorage 'fake' clipboard to save/load binding info to/from
 *
 */
export namespace PartUtils {
    /** A standard name for options that accept a single table.
     *
     * If a part has this option, and meets the assumptions detailed in
     * [PartUtils], then it will be considered a 'table part' and will recieve
     * the shortcut UX behaviors.
     */
    export const INPUT_OPTION = "Input Table" as const;

    /** A standard name of options that accept a primitive
     *
     * If a part has this option, it will be assumed to be a "value part", and
     * given some additional shortcut UX behaviors
     */
    export const VALUE_OPTION = "Value" as const;

    export function isTablePart(part: Part) {
        const metadata = part.constructor.GetMetadata();
        return metadata.getMetadataForOption(INPUT_OPTION) != null;
    }

    export function isValuePart(part: Part) {
        const metadata = part.constructor.GetMetadata();
        return metadata.getMetadataForOption(VALUE_OPTION) != null
            || metadata.getMetadataForOption(INPUT_OPTION) != null;
    }

    export function getValueOption(part: Part) {
        const metadata = part.constructor.GetMetadata();
        return metadata.getMetadataForOption(VALUE_OPTION)
            || metadata.getMetadataForOption(INPUT_OPTION)
            || null;
    }
}
