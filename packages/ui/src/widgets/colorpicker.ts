import { Color } from "@mavenomics/coreutils";
import { Widget, BoxLayout } from "@phosphor/widgets";
import * as colorString from "color-string";
import { Signal, ISignal } from "@phosphor/signaling";

export class ColorPicker extends Widget {
    // narrows Widget#layout type
    public readonly layout: BoxLayout;
    private canvas: Private.CanvasWidget;
    private valueSlider: Private.SliderWidget;
    private alphaSlider: Private.SliderWidget;
    private _onChange: Signal<this, Color> = new Signal(this);
    private _color: Color;

    constructor({color = new Color("white")}: ColorPicker.IOptions = {}) {
        super();
        this.addClass("m-ColorPicker");
        this._color = color;
        const rgb = colorString.get.rgb(color.color) || [255, 255, 255, 1];
        const hsv = color.color === "transparent"
                    ?  [0, 0, 1] as [number, number, number]
                    : Private.rgbToHsv(rgb[0], rgb[1], rgb[2]);
        this.canvas = new Private.CanvasWidget(...hsv);
        this.canvas.onChange.connect(this.handleColorChange, this);
        this.valueSlider = new Private.SliderWidget("Brightness: ", hsv[2]);
        this.valueSlider.node.title = "Value, in the HSV color model";
        this.alphaSlider = new Private.SliderWidget("Transparency: ", rgb[3] == null ? 1 : rgb[3]);
        this.layout = new BoxLayout();

        BoxLayout.setSizeBasis(this.valueSlider, 30);
        BoxLayout.setSizeBasis(this.alphaSlider, 30);
        BoxLayout.setStretch(this.valueSlider, 0);
        BoxLayout.setStretch(this.alphaSlider, 0);
        BoxLayout.setStretch(this.canvas, 1);

        this.layout.addWidget(this.canvas);
        this.layout.addWidget(this.valueSlider);
        this.layout.addWidget(this.alphaSlider);
    }

    /* Emits with the updated color */
    public get onChange(): ISignal<this, Color> {
        return this._onChange;
    }

    public get color(): Color {
        return this._color;
    }

    public set color(newColor: Color) {
        this._color = newColor;
        const rgb = colorString.get.rgb(newColor.color) || [255, 255, 255, 1];
        const hsv = Private.rgbToHsv(rgb[0], rgb[1], rgb[2]);
        this.canvas.hue = hsv[0];
        this.canvas.saturation = hsv[1];
        this.valueSlider.value = hsv[2];
        this.alphaSlider.value = rgb[3] == null ? 1 : rgb[3];
        this.canvas.value = hsv[2];
    }

    public handleEvent(ev: Event) {
        switch (ev.type) {
            case "m-slider-change":
                this.handleValueChange(ev as Private.SliderChangeEvent);
        }
    }

    public dispose() {
        if (this.isDisposed) return;
        this.canvas.onChange.disconnect(this.handleColorChange, this);
        super.dispose();
    }

    protected onAfterAttach() {
        this.node.addEventListener("m-slider-change", this);
    }

    protected onBeforeDetach() {
        this.node.removeEventListener("m-slider-change", this);
    }

    private handleValueChange(ev: Private.SliderChangeEvent) {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.originator === this.valueSlider) {
            this.canvas.value = ev.value;
        }
        this.handleColorChange(void 0, [
            this.canvas.hue,
            this.canvas.saturation,
            this.canvas.value,
            this.alphaSlider.value
        ]);
    }

    private handleColorChange(_sender: any, [hue, saturation, value, alpha]: number[]) {
        const rgb = Private.hsvToRgb(hue, saturation, value);
        this._color = new Color("white");
        if (this.alphaSlider.value === 0) {
            this._color.color = "transparent";
        } else {
            this._color.color = [...rgb, (alpha == null ? 255 : alpha)];
        }
        this._onChange.emit(this._color);
    }
}

export namespace ColorPicker {
    export interface IOptions {
        /**
         * The initial color of the picker control.
         */
        color?: Color;
    }
}

namespace Private {
    export class CanvasWidget extends Widget {
        public onChange: Signal<this, [number, number, number]> = new Signal(this);
        private width: number;
        private height: number;
        private _hue: number;
        private _saturation: number;
        private _value: number;
        private canvas: HTMLCanvasElement;
        private ctx: CanvasRenderingContext2D;

        constructor(hue: number, saturation: number, value: number) {
            super({node: document.createElement("canvas")});
            const canvas = this.node as HTMLCanvasElement;
            this.canvas = canvas;
            this._hue = hue;
            this._saturation = saturation;
            this._value = value;
            this.ctx = canvas.getContext("2d")!;
            this.height = 0;
            this.width = 0;
        }

        public handleEvent(ev: MouseEvent) {
            switch (ev.type) {
                case "mousedown":
                    this.handleMouseDown(ev);
                    break;
                case "mousemove":
                    this.handleMouseMove(ev);
                    break;
                case "mouseup":
                case "mouseleave":
                    this.handleMouseUp(ev);
                    break;
            }
        }

        public get hue() {
            return this._hue;
        }

        public set hue(newHue: number) {
            this._hue = newHue;
            this.redraw();
        }

        public get saturation() {
            return this._saturation;
        }

        public set saturation(newSaturation: number) {
            this._saturation = newSaturation;
            this.redraw();
        }

        public get value() {
            return this._value;
        }

        public set value(newValue: number) {
            this._value = newValue;
            this.redraw();
        }

        protected onResize() {
            this.maybeRedraw();
        }

        protected onUpdateRequest() {
            this.maybeRedraw();
        }

        protected onAfterAttach() {
            this.node.addEventListener("mousedown", this);
        }

        private handleMouseDown(ev: MouseEvent) {
            this.node.addEventListener("mousemove", this);
            this.node.addEventListener("mouseleave", this);
            this.node.addEventListener("mouseup", this);
            this.handleMouseMove(ev);
        }

        private handleMouseMove(ev: MouseEvent) {
            const { left, top } = this.node.getBoundingClientRect();
            const radius = Math.min(this.width, this.height) / 2;
            const [x, y] = [ev.clientX - left, ev.clientY - top];
            const [r, theta] = rectToPolar(x, y, radius);
            this._hue = theta;
            this._saturation = Math.min(r / radius, 1);
            this.onChange.emit([this._hue, this._saturation, this._value]);
            this.redraw();
        }

        private handleMouseUp(ev: MouseEvent) {
            this.node.removeEventListener("mousemove", this);
            this.node.removeEventListener("mouseleave", this);
            this.node.removeEventListener("mouseup", this);
        }

        private maybeRedraw() {
            const {width, height} = this.node.getBoundingClientRect();
            if (width !== this.width || height !== this.height) {
                this.height = height;
                this.width = width;
                this.redraw();
            }
        }

        private redraw() {
            const rad = Math.min(this.width, this.height);
            this.canvas.height = this.height;
            this.canvas.width = this.width;

            this.ctx.restore();

            drawHsvCircle(this._value, this.ctx, {
                width: rad, height: rad
            });

            this.ctx.beginPath();
            const x = (this._saturation * rad / 2) * Math.cos((this._hue * Math.PI / 180) + Math.PI / 2) + rad / 2;
            const y = (this._saturation * rad / 2) * Math.sin((this._hue * Math.PI / 180) - Math.PI / 2) + rad / 2;
            this.ctx.arc(x, y, 10, 0, Math.PI * 2, true);
            const [r, g, b] = hsvToRgb(this._hue, this._saturation, this._value);
            this.ctx.fillStyle = `rgb(${r},${g},${b})`;

            this.ctx.fill();
            if (this._value >= 0.5) {
                this.ctx.strokeStyle = "black";
            } else {
                this.ctx.strokeStyle = "white";
            }
            this.ctx.arc(x, y, 10, 0, Math.PI * 2, true);
            this.ctx.stroke();
        }
    }

    export class SliderWidget extends Widget {
        private sliderEl: HTMLInputElement;
        private _value: number;

        constructor(label: string, initalValue: number) {
            super({node: document.createElement("label")});
            this.addClass("m-ValueSlider");
            this.node.innerText = label;
            this.sliderEl = document.createElement("input");
            this.sliderEl.type = "range";
            this.sliderEl.min = "0";
            this.sliderEl.max = "1";
            this._value = initalValue;
            this.sliderEl.value = "" + initalValue;
            this.sliderEl.setAttribute("value", "" + initalValue);
            this.sliderEl.step = "0.001";
            this.node.appendChild(this.sliderEl);
        }

        public get value() {
            return this._value;
        }

        public set value(newval: number) {
            this._value = newval;
            this.sliderEl.value = "" + newval;
        }

        public handleEvent(ev: Event) {
            switch (ev.type) {
                case "input":
                    this.handleValueChange((ev.target! as HTMLInputElement).value);
            }
        }

        protected onAfterAttach() {
            this.sliderEl.value = "" + this._value;
            this.sliderEl.addEventListener("input", this);
        }

        protected onBeforeDetach() {
            this.sliderEl.removeEventListener("input", this);
        }

        private handleValueChange(newValue: string) {
            const value = parseFloat(newValue);
            if (Number.isNaN(value)) return;
            this._value = value;
            const ev = new SliderChangeEvent(value, this, {bubbles: true});
            this.node.dispatchEvent(ev);
        }
    }

    export class SliderChangeEvent extends Event {
        public value: number;
        public originator: SliderWidget;

        constructor(value: number, originator: SliderWidget, init: EventInit) {
            super("m-slider-change", init);
            this.value = value;
            this.originator = originator;
        }
    }

    export function drawHsvCircle(value: number, ctx: CanvasRenderingContext2D, rect: {width: number, height: number}) {
        const {width, height} = rect;
        console.assert(width === height, "Color picker must be square!");
        const radius = Math.min(width, height) / 2;
        const img = ctx.createImageData(width, height);
        const data = img.data;

        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                // get polar coordinates for HSL, with theta in degrees
                const [r, theta] = rectToPolar(x, y, radius);
                if (r > radius) continue;
                const color = Private.hsvToRgb(theta, r / radius, value);

                // Correct for the proper location to write to.
                // ImageData arrays have a stride of 4 bytes
                const coord = y * height + x;
                const stride = 4;
                data[coord * stride    ] = color[0];
                data[coord * stride + 1] = color[1];
                data[coord * stride + 2] = color[2];
                data[coord * stride + 3] = 255; // opacity
            }
        }

        ctx.putImageData(img, 0, 0);
    }

    export function rectToPolar(x: number, y: number, radius: number) {
        // get polar coordinates, with theta in degrees
        const r = Math.sqrt(Math.pow(x - radius, 2) + Math.pow(y - radius, 2));
        const theta = ((Math.atan2(x - radius, y - radius) + Math.PI) / (2 * Math.PI)) * 360;
        return [r, theta];
    }

    /**
     * Convert a given color in HSV space to RGB space
     *
     * We need this, since the ImageData API only works in RGB space (whereas
     * the color wheel must be in HSV space).
     *
     * @param hue The hue, in degrees, of the color
     * @param saturation Saturation, in the range [0-1]
     * @param value Value, in the range [0-1]
     * @returns A 3-tuple of [r, g, b], each element being in the range [0-255]
     *
     * @see https://en.wikipedia.org/wiki/HSL_and_HSV#HSV_to_RGB
     */
    export function hsvToRgb(
        hue: number,
        saturation: number,
        value: number
    ): [number, number, number] {
        let chroma = value * saturation;
        let hueSextant = hue / 60;
        let chromaCorrection = chroma * (1 - Math.abs((hueSextant % 2) - 1));
        let r1: number, g1: number, b1: number;

        if (hueSextant <= 1) {
            ([r1, g1, b1] = [chroma, chromaCorrection, 0]);
        } else if (hueSextant <= 2) {
            ([r1, g1, b1] = [chromaCorrection, chroma, 0]);
        } else if (hueSextant <= 3) {
            ([r1, g1, b1] = [0, chroma, chromaCorrection]);
        } else if (hueSextant <= 4) {
            ([r1, g1, b1] = [0, chromaCorrection, chroma]);
        } else if (hueSextant <= 5) {
            ([r1, g1, b1] = [chromaCorrection, 0, chroma]);
        } else {
            ([r1, g1, b1] = [chroma, 0, chromaCorrection]);
        }

        let valueCorrection = value - chroma;
        let [r, g, b] = [r1! + valueCorrection, g1! + valueCorrection, b1! + valueCorrection];

        // Change r,g,b values from [0,1] to [0,255]
        return [Math.round(255 * r), Math.round(255 * g), Math.round(255 * b)];
    }

    /**
     * Convert a given color in HSV space to RGB
     *
     * @param red The red component of the color, in the range [0-255]
     * @param green The green component of the color, in the range [0-255]
     * @param blue The blue component of the color, in the range [0-255]
     * @returns A 3-tuple of [hue, saturation, value].
     *
     * @see https://en.wikipedia.org/wiki/HSL_and_HSV#General_approach
     */
    export function rgbToHsv(
        red: number,
        green: number,
        blue: number
    ): [number, number, number] {
        // transform from [0-255] to [0-1]
        red /= 255;
        green /= 255;
        blue /= 255;
        const max = Math.max(red, green, blue);
        const min = Math.min(red, green, blue);
        const chroma = max - min;

        let hueSextant: number;
        if (chroma === 0) {
            hueSextant = 0;
        } else if (max === red) {
            hueSextant = ((green - blue) / chroma) % 6;
        } else if (max === green) {
            hueSextant = (blue - red) / chroma + 2;
        } else if (max === blue) {
            hueSextant = (red - green) / chroma + 4;
        }
        const hue = hueSextant! * 60;
        const value = max;
        const saturation = value === 0 ? 0 : chroma / value;

        return [hue, saturation, value];
    }
}
