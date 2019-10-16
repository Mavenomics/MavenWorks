import * as React from "react";

/**
 * React control for displaying a WPF-style ListBox
 *
 * This component is fully controlled, and depends on a CSS stylesheet at
 * [@mavenomics/ui/style/listbox.css].
 */
export const ListBox: React.SFC<ListBox.IProps> = (
    {items, selectedKey, isEditing, onEdit, onSelect}
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
