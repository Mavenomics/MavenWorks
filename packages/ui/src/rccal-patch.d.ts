// Annoyingly, the Calendar is typed (and has those types distributed with the
// library) but not the Picker.
declare module "rc-calendar/lib/Picker";

declare module "color-name" {
    declare const colors: {
        [color: string]: [number, number, number]
    };
    module.exports = colors;
}