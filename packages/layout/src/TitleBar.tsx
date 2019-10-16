import * as React from "react";
import { ReactWrapperWidget } from "@mavenomics/ui";
import { Title, Widget } from "@phosphor/widgets";
import { DashboardLayoutRegion } from "./DashboardLayoutRegion";

export function TitleBar({caption, color, background}: TitleBar.IProps) {
    return (
        <span className={"m-TitleBar"} style={{ color, background }}>{caption}</span>
    );
}

export namespace TitleBar {
    export interface IProps {
        caption: string;
        color: string;
        background: string;
    }

    interface IEditableProps extends IProps {
        captionChanged: (this: void, caption: string) => void;
        onBlur: (this: void) => void;
    }

    export const EditableTitleBar: React.SFC<IEditableProps> = ({
        caption,
        color,
        background,
        captionChanged,
        onBlur
    }) => {
        const maybeBlur: React.KeyboardEventHandler = (ev) => {
            if (ev.key === "Enter" || ev.key === "Escape") {
                onBlur.call(void 0);
            }
        };
        return (
            <span className={"m-TitleBar m-TitleBar-editable"} style={{color, background}}>
                <input type="text"
                    className={"m-TitleBar-editableInput"}
                    value={caption}
                    onChange={(ev) => captionChanged.call(void 0, ev.target.value)}
                    onFocus={({target}) => target.select()} // select the full content of the text area
                    onBlur={() => onBlur.call(void 0)}
                    onKeyDown={maybeBlur}
                    autoFocus={true}
                />
            </span>
        );
    };

    export class WidgetWrapper extends ReactWrapperWidget {
        private readonly widgetTitle: Title<Widget>;
        private readonly owner: DashboardLayoutRegion;
        private dragStartPosition: [number, number] | null = null;
        private editable = false;

        constructor(owner: DashboardLayoutRegion<any>) {
            super();
            this.addClass("m-TitleBar-Wrapper");
            this.owner = owner;
            this.widgetTitle = this.owner.title;
            // update when the title changes
            this.widgetTitle.changed.connect(this.update, this);
        }

        public dispose() {
            if (this.isDisposed) {
                return;
            }
            this.widgetTitle.changed.disconnect(this.update, this);
            super.dispose();
        }

        public edit() {
            this.editable = true;
            this.update();
        }

        public handleEvent(ev: PointerEvent) {
            switch (ev.type) {
                case "pointerdown":
                    this.onStartDrag(ev);
                    break;
                case "pointermove":
                    this.onMove(ev);
                    break;
                case "pointerup":
                    this.endDrag();
                    break;
                default:
                    throw Error("Unhandled event");
            }
        }

        protected render() {
            if (this.isDisposed) {
                throw Error("TitleBarWidget disposed");
            }
            let color = this.widgetTitle.dataset["color"];
            if (color === "transparent") {
                color = "";
            }
            let background = this.widgetTitle.dataset["background"];
            if (background === "transparent") {
                background = "";
            }
            if (this.editable) {
                return (
                    <EditableTitleBar
                        caption={this.widgetTitle.label}
                        color={color}
                        background={background}
                        captionChanged={(caption) => {
                            this.owner.setLayoutProperty("caption", caption);
                        }}
                        onBlur={() => {
                            this.editable = false;
                            this.update();
                        }}/>
                );
            }
            // NB: Title.prototype.caption is not actually the caption we want
            // (Language is slippery)
            return (
                <TitleBar
                    caption={this.widgetTitle.label}
                    color={color}
                    background={background}/>
            );
        }

        protected onAfterAttach() {
            this.node.addEventListener("pointerdown", this);
        }

        protected onBeforeDetach() {
            this.node.removeEventListener("pointerdown", this);
        }

        private onStartDrag(ev: PointerEvent) {
            if (ev.pointerType === "mouse" && ev.button !== 0) {
                // this is not a left click, don't drag
                return;
            }
            if (this.editable) return; // don't drag when editing
            this.dragStartPosition = [ev.clientX, ev.clientY];
            document.addEventListener("pointermove", this, {capture: true});
            document.addEventListener("pointerup", this, {capture: true});
        }

        private onMove(ev: PointerEvent) {
            if (!this.node.contains(ev.target as Element)) {
                // mouseup occured off the titlebar, don't start the drag for
                // reliability reasons
                this.endDrag();
                return;
            }
            const norm = Math.abs(ev.clientX - this.dragStartPosition![0])
                       + Math.abs(ev.clientY - this.dragStartPosition![1]);
            if (norm > 2) {
                this.endDrag();
                // trigger a drag
                this.owner.startDrag(ev.clientX, ev.clientY);
            }
        }

        private endDrag() {
            document.removeEventListener("pointerup", this, {capture: true});
            document.removeEventListener("pointermove", this, {capture: true});
            this.dragStartPosition = null;
        }
    }
}
