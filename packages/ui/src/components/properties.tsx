import * as React from "react";
import { Type } from "@mavenomics/coreutils";

// We need to add the --indent var to CSSProperties, so that React's typings
// will allow it in element inline styles.
declare module "react" {
    interface CSSProperties {
        "--indent"?: string;
    }
}

function generateDocString(metadata: PropertiesEditor.IPropertyMetadata) {
    return `${metadata.prettyName}: ${metadata.documentation || ""}
    Type: ${metadata.type.serializableName}
    Default: ${metadata.default}`;
}

function FlippyTriangle({isCollapsed, onCollapse}: FlippyTriangle.IProps) {
    return (<button className="m-FlippyTriangle"
        onClick={() => onCollapse.call(void 0, !isCollapsed)}
        data-collapsed={"" + isCollapsed}></button>);
}

namespace FlippyTriangle {
    export interface IProps {
        isCollapsed: boolean;
        onCollapse: (this: void, willCollapse: boolean) => void;
    }
}

function HeaderRow({prop, onCollapse}: HeaderRow.IProps) {
    return (<span className="m-PropertiesEditor-PropertyLabel
                m-PropertiesEditor-PropertyGroup">
            <FlippyTriangle isCollapsed={prop.isCollapsed}
                onCollapse={(willCollapse) => onCollapse.call(void 0, prop.key, willCollapse)} />
            {prop.name}
        </span>);
}

namespace HeaderRow {
    export interface IProps {
        prop: Private.IParentRow;
        onCollapse: (this: void, path: string, willCollapse: boolean) => void;
    }
}

function LeafRow(
    {prop, children}: React.PropsWithChildren<{prop: Private.ILeafRow}>,
) {
    return (<React.Fragment>
        <span className="m-PropertiesEditor-PropertyLabel"
            title={generateDocString(prop.metadata)}>
            {prop.name}
        </span>
        {children}
    </React.Fragment>);
}

/** Stateless editor wrapper for properties
 * Takes in a list of property keys and a function to render a particular property's keys
 */
export function PropertiesEditor({
    properties, renderEditor, groupOnDots = true
}: PropertiesEditor.IProps) {
    const [collapsedPaths, setCollapsedPaths] = React.useState([] as string[]);
    const props = Array.from(properties)
        .sort((a, b) => a[1].prettyName.localeCompare(b[1].prettyName));

    let propsToDisplay: Private.IPropDisplayData[];

    if (groupOnDots) {
        propsToDisplay = Private.BuildTree(props, collapsedPaths);
    } else {
        propsToDisplay = props.map(i => ({
            name: i[0],
            key: i[0],
            metadata: i[1],
            indent: 0,
            isParent: false,
            isCollapsed: false
        }));
    }
    return (
        <div className="m-PropertiesEditor">
            {propsToDisplay.map((prop) => {
                return (<div className="m-PropertiesEditor-Property"
                    key={prop.key}
                    style={{
                        "--indent": "" + prop.indent
                    }}>
                    {prop.isParent ? (
                        <HeaderRow prop={prop}
                            onCollapse={(path, willCollapse) => {
                                if (willCollapse) {
                                    setCollapsedPaths([
                                        ...collapsedPaths,
                                        path
                                    ]);
                                } else {
                                    setCollapsedPaths(
                                        collapsedPaths.filter(i => i !== path)
                                    );
                                }
                            }} />
                        ) : (
                            <LeafRow prop={prop}>
                                {renderEditor.call(
                                    void 0,
                                    prop.key,
                                    prop.metadata
                                )}
                            </LeafRow>
                        )
                    }
                </div>);
            })}
        </div>
    );
}


export namespace PropertiesEditor {
    export interface IPropertyMetadata {
        /** The user-facing name of this property.
         *
         * If groupOnDots is true, the properties will be rendered as a
         * hierarchy.
         *
         * @see PropertiesEditor.IProps.groupOnDots
         */
        prettyName: string;
        /** A short, one-or-two-line summary of this property.
         *
         * This should be descriptive but terse- it is displayed as a tooltip
         * on the property, alongisde the type and default value.
         */
        documentation?: string;
        /** The type of editor to use with this property. */
        type: Type;
        /** The default value that this property takes on, if applicable. */
        default: any;
        /** Optional schema describing how this property should be shaped.
         *
         * NOTE: Right now, the only thing using this is the String editor for
         * rendering a dropdown if the schema indicates that the type is an enum.
         */
        schema?: { enum: string[] };
    }

    export interface IProps {
        properties: Array<[string, IPropertyMetadata]>;
        /** A callback to render the editor for a particular property.
         *
         * This editor should be rendered in-line. For visual consistency,
         * the editor should _not_ cause the height of the row to change. It is
         * rendered ~1em high, with a minimum height of ~21px.
         */
        renderEditor: (
            this: void,
            key: string,
            metadata: IPropertyMetadata
        ) => JSX.Element | null;
        /** Whether to display properties as a tree (true) or flat (false).
         *
         * If true, property names are grouped on dots ("."). So if two props
         * have names "Appearance.Font" and "Appearance.Size", the resulting
         * tree will be:
         *
         *  - Appearance
         *    - Font
         *    - Size
         *
         * Parent groups will be inferred from the observed properties. Do not
         * use any property names that collide with the full name of a group-
         * for example, "Appearance.Font.Family" should not be used with
         * "Appearance.Font" (as "Font" will be both a property and a parent).
         * However, "Appearance.Font" and "Appearance.FontDetails.Font" will not
         * conflict, nor will "Appearance" and "Appearance.Appearance".
         */
        groupOnDots?: boolean;
    }
}

export namespace Private {
    export interface ILeafRow {
        name: string;
        metadata: PropertiesEditor.IPropertyMetadata;
        indent: number;
        isParent: false;
        isCollapsed: false;
        key: string;
    }

    export interface IParentRow {
        name: string;
        metadata: null;
        indent: number;
        isParent: true;
        isCollapsed: boolean;
        key: string;
    }

    export type IPropDisplayData = ILeafRow | IParentRow;

    /** Iterate through the options, returning a tree structure.
     *
     * NOTE: The options _must_ be lexicographically sorted first!
     */
    export function BuildTree(
        opts: [string, PropertiesEditor.IPropertyMetadata][],
        collapsedPaths: string[]
    ): IPropDisplayData[] {
        const newOpts: IPropDisplayData[] = [];
        let parents: string[] = [];

        for (let i = 0; i < opts.length; i++) {
            const opt = opts[i];
            let newParents = parents.slice();
            for (const row of optToProperty(opt, collapsedPaths, parents)) {
                newOpts.push(row);
                if (!row.isParent) {
                    continue;
                }
                if ((newParents.length) > row.indent) {
                    newParents = newParents.slice(0, row.indent);
                }
                newParents.push(row.name);
            }
            parents = newParents;
        }

        return newOpts;
    }

    export function* optToProperty(
        opt: [string, PropertiesEditor.IPropertyMetadata],
        collapsedPaths: string[],
        parents: string[]
    ): IterableIterator<IPropDisplayData> {
        const stringPath = opt[1].prettyName;
        const path = stringPath.split(".");
        let indent = 0;
        // iterate through the parents until we hit the first non-match
        for (let j = 0; j < (path.length - 1); j++) {
            if (parents[j] != null && parents[j] === path[j]) {
                indent++;
                continue; // parent already defined
            }
            break;
        }
        // test if the path was collapsed. If so, elide it
        let collapseCandidates = [];
        let collapsePath: string | null = null;
        for (let j = 0; j < collapsedPaths.length; j++) {
            if (!stringPath.startsWith(collapsedPaths[j])) {
                continue;
            }
            collapseCandidates.push(collapsedPaths[j]);
            if (collapsePath == null || collapsedPaths[j].length < collapsePath.length) {
                collapsePath = collapsedPaths[j];
            }
        }
        // yield new parents
        // Note that we check for isCollapsed twice: once when generating
        // new parents, and once below. This is because if we have A.B.C, and
        // A.B is collapsed, we want to generate A, A.B, and omit C (regardless
        // of whether there's also an A.B.A or A.A)
        for (let j = indent; j < (path.length - 1); j++) {
            indent++;
            const key = path.slice(0, j + 1).join(".");
            if (collapsePath && collapsePath.length < key.length) {
                // there's an already collapsed parent
                return;
            }
            const isCollapsed = collapseCandidates.indexOf(key) !== -1;
            yield {
                name: path[j],
                indent: j,
                isCollapsed,
                isParent: true,
                metadata: null,
                key
            };
            // elide any further rows
            if (isCollapsed) return;
        }
        if (collapseCandidates.length > 0) return;
        // yield the leaf row
        yield {
            name: path[path.length - 1],
            indent,
            isCollapsed: false,
            isParent: false,
            metadata: opt[1],
            key: opt[0]
        };
    }
}
