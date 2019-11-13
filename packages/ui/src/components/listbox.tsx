import * as React from "react";

/**
 * React control for displaying a WPF-style ListBox
 *
 * This component is fully controlled, and depends on a CSS stylesheet at
 * [@mavenomics/ui/style/listbox.css].
 * 
 * The stylesheet also depends on a set of variables defined in
 * [@mavenomics/ui/style/variables.css], but you can define them yourself if
 * you need to customize the colors:
 * 
 *  - `--m-active-font-color`: The font color of selected items
 *  - `--m-inactive-font-color`: The font color of unselected items
 *  - `--m-selected-ui-color`: The background color of selected items
 *  - `--m-inactive-ui-color`: The background color of unselected items being
 *    hovered over with the mouse
 *  - `--m-hover-selected-ui-color`: The background color of selected items
 *    being hovered over with the mouse
 * 
 * @example
 * 
 * // A simple example that echos the selected item, and `alert()`s when one
 * // is double-clicked.
 * const MyListBoxForm = () => {
 *     const [selected, setSelected] = React.useState<string | null>(null);
 *     const items = [
 *         { key: "a", label: "A" }
 *         { key: "b", label: "B" }
 *         { key: "c", label: "C" }
 *     ];
 *     return (<div>
 *         <span>Selected: {selected}</span>
 *         <ListBox items={items}
 *             selectedKey={selected}
 *             onCommit={key => alert("Double clicked " + key + "!")}
 *             onSelect={key => setSelected(key)}
 *             isEditing={false}
 *             onEdit={() => void 0} />
 *     </div>);
 * }
 */
export const ListBox: React.SFC<ListBox.IProps> = (
    {items, selectedKey, isEditing, onEdit, onSelect, onCommit}
) => {
    const editableLabel = items.find(i => i.key === selectedKey);
    const [label, setLabel] = React.useState(editableLabel ? editableLabel.label : "");
    if (!isEditing && label !== "") {
        setLabel("");
    }

    function renderNode(i: ListBox.ListItem) {
        let className = "m-ListBox-item";
        let content: React.ReactElement | string = i.label;
        if (selectedKey && i.key === selectedKey) {
            className += " m-selected";
            if (isEditing) {
                className += " m-editing";
                content = (<input type="text"
                    autoFocus={true}
                    value={label}
                    onChange={(ev) => setLabel(ev.target.value)}
                    onBlur={() => {
                        onEdit.call(void 0, i.key, label);
                    }}
                    onKeyDown={(ev) => {
                        if (ev.key !== "Enter" && ev.key !== "Escape") {
                            return;
                        }

                        if (ev.key === "Escape") {
                            setLabel(i.label);
                            onSelect.call(void 0, null);
                        }
                        ev.persist();

                        setTimeout(() => (ev.target as HTMLInputElement).blur());
                    }}/>
                );
            }
        }
        return (<li key={i.key}
            data-list-key={i.key}
            className={className}
            onMouseDown={() => {
                // don't invoke if the label didn't change
                if (i.key === selectedKey) return;
                onSelect.call(void 0, i.key);
            }}
            onDoubleClick={() => {
                if (onCommit) {
                    onCommit.call(void 0, i.key);
                }
            }}>
                {content}
            </li>
        );
    }

    return (
        <ul className="m-ListBox">
            { items.map(i => renderNode(i)) }
        </ul>
    );
};

export namespace ListBox {
    export interface IProps {
        /** The items contained in the listbox. */
        items: ReadonlyArray<ListItem>;

        /** The key of the selected item, or 'null' if no item is selected. */
        selectedKey: string | null;

        /** A callback invoked whenever the user selects a new item.
         *
         * @param key The string key of the item that was selected.
         *
         * @remarks
         *
         * This will not actually _set_ the selected item- this is up to the
         * consumer to set the selectedKey property.
         */
        onSelect: (this: void, key: string | null) => void;

        /**
         * A callback fired whenever the user "commits" some action.
         *
         * Most list boxes don't just represent a list of things, they can also
         * represent a choice that the user can make (such as what flavor of
         * ice cream they want). Sometimes this requires deliberation, so a user
         * might click through a few options before hitting a "Submit" button.
         * Other times, they know _exactly_ what they want and they want it now!
         * They don't like having to click, mouse move, click 'apply', close, etc.
         *
         * The listbox can't really encompass _all_ of that behavior, so instead
         * it exposes this callback to let consumers decide what they want to do
         * with it.
         *
         * Note that the details of _when_ this gets applied should be considered
         * internal to the ListBox. Right now, it only respects "double click",
         * but that may change in the future.
         */
        onCommit?: (this: void, key: string) => void;

        /** Whether the currently selected item's label should be editable. */
        isEditing: boolean;

        /** A callback invoked when the user commits an edit to a label.
         *
         * A change is 'committed' when the user navigates away from the field,
         * such as by deselecting it, pressing "enter", or pressing "escape".
         *
         * @remarks
         *
         * This does not actually _set_ the selected item's label- this is up to
         * the consumer.
        */
       onEdit: (this: void, key: string, newLabel: string) => void;
    }

    /**
     * An interface describing an item in the listbox.
     */
    export interface ListItem {
        /** A unique key to reference this item by. */
        key: string;
        /** A user-visible label to display for this item. */
        label: string;
    }
}
