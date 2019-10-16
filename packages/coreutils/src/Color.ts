import { Type, Types} from "./builtin";
import { Converter, Converters } from "./conversions";
import * as colorString from "color-string";

export class Color {

    private _colorRgba: number[] = [255, 255, 255, 1];
    private _colorString = "white";

    get color() {
        return this._colorString;
    }

    set color(color: any) {
        if (typeof color === "string") {
            // lowercase the string to allow for, eg, `Red` vs `red`
            this._colorRgba = colorString.get(color.toLowerCase())!.value;
            this._colorString = color;
        } else if (color instanceof Array) {
            this._colorRgba = color;
            let asKeyword = colorString.to.keyword(color);
            if ((color.length > 4 || color[3] === 1) && asKeyword != null) {
                this._colorString = asKeyword;
            } else {
                this._colorString = colorString.to.hex(color);
            }
        }
    }

    constructor(obj: string | [number, number, number, number?]) {
        this.color = obj;
    }

    get rgb(): string {
        return colorString.to.rgb(this._colorRgba);
    }

    get hex(): string {
        return colorString.to.hex(this._colorRgba);
    }

    get hsl(): string {
        return colorString.to.hsl(this._colorRgba);
    }
}

export class ColorConverter extends Converter<Color> {
    public static type = Types.Color;

    isValid(obj: object): boolean {
        return (typeof obj === "string" && colorString.get(obj) != null) || obj instanceof Color;
    }

    canConvertFrom(srcType: Type): boolean {
        return typeof srcType === "string";
    }

    convertFrom(obj: any, srcType: Type) {
        return new Color(obj);
    }

    canStringify(): boolean {
        return true;
    }

    toString(obj: Color): string {
        return obj.color;
    }

    tryFromString(obj: string): any {
        return colorString.get(obj.toLocaleLowerCase()) == null ? void 0 : new Color(obj.toLocaleLowerCase());
    }

    serialize(obj: Color) {
        return obj.color;
    }

    deserialize(obj: string) {
        return new Color(obj);
    }

    inferInstanceOf(obj: any) {
        return obj instanceof Color ? 1.0 : -1.0;
    }
}

Converters.registerConverter(ColorConverter);
