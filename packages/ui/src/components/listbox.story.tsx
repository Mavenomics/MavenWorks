import * as React from "react";
import { ListBox } from "./listbox";

// you can also import `index.css` to pull in all
// rules for the UI package
import "../../style/variables.css";
import "../../style/listbox.css";

export default { title: "ListBox" };

export const simple = () => {
    const [selected, setSelected] = React.useState<string | null>(null);
    const items = [
        { key: "a", label: "A" },
        { key: "b", label: "B" },
        { key: "c", label: "C" }
    ];
    return (<div>
        <span>Selected: {selected}</span>
        <ListBox items={items}
            selectedKey={selected}
            onCommit={key => alert("Double clicked " + key + "!")}
            onSelect={key => setSelected(key)}
            isEditing={false}
            onEdit={() => void 0} />
    </div>);
};

export const withEditing = () => {
    const [isEditing, setIsEditing] = React.useState<boolean>(false);
    const [selected, setSelected] = React.useState<string | null>(null);
    const [items, setItems] = React.useState<{key: string, label: string}[]>([
        { key: "a", label: "A" },
        { key: "b", label: "B" },
        { key: "c", label: "C" }
    ]);
    function onEdit(key: string, newLabel: string) {
        const oldIdx = items.findIndex(i => i.key === key);
        setItems([
            ...items.slice(0, oldIdx),
            {key, label: newLabel},
            ...items.slice(oldIdx + 1)
        ]);
        setIsEditing(false);
    }
    return (<div>
        <span>Selected: {selected}</span>
        <button onClick={() => setIsEditing(true)}>Edit selected node</button>
        <ListBox items={items}
            selectedKey={selected}
            onCommit={key => alert("Double clicked " + key + "!")}
            onSelect={key => setSelected(key)}
            isEditing={isEditing}
            onEdit={onEdit} />
    </div>);
}