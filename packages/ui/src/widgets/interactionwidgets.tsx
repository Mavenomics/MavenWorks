import { ReactWrapperWidget } from "../reactwidget";
import { Subject, Observable } from "rxjs";
import { Widget } from "@phosphor/widgets";
import * as React from "react";
import { MathTools, FrameTools } from "@mavenomics/coreutils";
import Vec2 = MathTools.Vec2;
import { ListBox } from "../components";

export namespace Interactions {
    export class Button extends ReactWrapperWidget {
        private _label = "";
        private _className = "";
        private _onClicked = new Subject<void>();

        public get onClicked(): Observable<void> { return this._onClicked; }

        public dispose() {
            if (this.isDisposed) return;
            this._onClicked.complete();
            super.dispose();
        }

        /** The button's text content */
        public get label() { return this._label; }
        public set label(newLabel: string) {
            this._label = newLabel;
            this.update();
        }

        /** Additional CSS classes to apply to the button */
        public get className() { return this._className; }
        public set className(newClass: string) {
            this._className = newClass;
            this.update();
        }

        protected render() {
            return (<button className={"m-Button " + this._className}
                onClick={() => this._onClicked.next()}>
                {this._label}
            </button>);
        }
    }

    export class ResizerGrippy extends Widget implements EventListenerObject {
        private readonly owner: Widget;
        private readonly boundary: HTMLElement;
        private dragStartPosition?: Vec2;
        private bounds?: Vec2;
        private oldSize?: {left: number, top: number, width: number, height: number};
        private _onSizeChange = new Subject<[number, number, number, number]>();

        constructor(owner: Widget, boundary: HTMLElement) {
            super();
            this.owner = owner;
            this.boundary = boundary;
            this.addClass("m-ResizeGrippy");
        }

        /**
         * An observable that emits an [x, y, width, height] 4-tuple whenever
         * the gripper is used to resize.
         *
         * @readonly
         */
        public get onSizeChange(): Observable<[number, number, number, number]> {
            return this._onSizeChange;
        }

        public dispose() {
            if (this.isDisposed) return;
            this._onSizeChange.complete();
            super.dispose();
        }

        public handleEvent(ev: Event) {
            switch (ev.type) {
                case "pointerdown":
                    this.onStartDrag(ev as PointerEvent);
                    break;
                case "pointerup":
                case "keyup":
                    this.onEndDrag(ev);
                    break;
                case "pointermove":
                    this.onDragResize(ev as PointerEvent);
                    break;
            }
        }

        protected onAfterAttach() {
            this.node.addEventListener("pointerdown", this);
        }

        protected onBeforeDetach() {
            this.node.removeEventListener("pointerdown", this);
            this.onEndDrag();
        }

        private onStartDrag(ev: PointerEvent) {
            ev.preventDefault();
            ev.stopPropagation();
            FrameTools.DisableFramePointerEvents();
            const oldRect = this.owner.node.getBoundingClientRect();
            const {width, height, left, top} = this.boundary.getBoundingClientRect();
            this.oldSize = {
                left: oldRect.left - left,
                top: oldRect.top - top,
                width: oldRect.width,
                height: oldRect.height,
            };
            this.dragStartPosition = [ev.clientX, ev.clientY];
            this.bounds = [width, height];

            window.addEventListener("keyup", this, {capture: true});
            window.addEventListener("pointerup", this, {capture: true});
            window.addEventListener("pointermove", this, {capture: true});
        }

        private onDragResize(ev: PointerEvent) {
            ev.preventDefault();
            ev.stopPropagation();

            const start = this.dragStartPosition!;
            const delta = Vec2.Sub([ev.clientX, ev.clientY], start);
            let {left, top, width, height} = this.oldSize!;

            const size = Vec2.Add([width, height], delta);

            this._onSizeChange.next(
                MathTools.ClampRectToBounds([left, top], size, this.bounds!)
            );
        }

        private onEndDrag(ev?: Event) {
            if (ev && ev.type === "keyup") {
                if ((ev as KeyboardEvent).key !== "Escape") {
                    return; // not a cancel event
                } else {
                    const {left, top, width, height} = this.oldSize!;
                    // undo the resize
                    this._onSizeChange.next([left, top, width, height]);
                }
            }
            FrameTools.EnableFramePointerEvents();

            window.removeEventListener("keyup", this, {capture: true});
            window.removeEventListener("pointerup", this, {capture: true});
            window.removeEventListener("pointermove", this, {capture: true});
            this.oldSize = undefined;
        }
    }

    export class ListBoxWidget extends ReactWrapperWidget {
        private _isEditing = false;
        private _selected: string | null = null;
        private _items: ListBox.ListItem[] = [];
        private _onEdit = new Subject<{key: string, newLabel: string}>();
        private _onSelect = new Subject<string | null>();

        public get isEditing() { return this._isEditing; }
        public get selected() { return this._selected; }
        public get items() { return this._items; }

        public set isEditing(newVal: boolean) { this._isEditing = newVal; this.update(); }
        public set selected(newVal: string | null) { this._selected = newVal; this.update(); }
        public set items(newVal: ListBox.ListItem[]) { this._items = newVal; this.update(); }

        public get onEdit(): Observable<{key: string, newLabel: string}> {
            return this._onEdit;
        }
        public get onSelect(): Observable<string | null> {
            return this._onSelect;
        }

        public dispose() {
            if (this.isDisposed) return;
            this._onEdit.complete();
            this._onSelect.complete();
            super.dispose();
        }

        protected render() {
            return (<ListBox
                items={this._items}
                isEditing={this._isEditing}
                onEdit={(key, newLabel) => this._onEdit.next({key, newLabel})}
                onSelect={(key) => {
                    this.selected = key;
                    this._onSelect.next(key);
                }}
                selectedKey={this._selected}/>
            );
        }
    }
}
