import { Private, PropertiesEditor } from "./properties";

function generateProp(
    name: string
): [string, PropertiesEditor.IPropertyMetadata] {
    return [name, {
        prettyName: name,
        default: 0,
        documentation: "test",
        type: null as any
    }];
}

describe("Property Treeing", () => {
    describe("function BuildTree", () => {
        test("Build Tree", () => {
            const els = Private.BuildTree([
                generateProp("Foo.Bar.Baz"),
                generateProp("Foo.Bar.Bat"),
                generateProp("Foo.Test"),
                generateProp("Bar.Soap"),
                generateProp("Bar.Test"),
                generateProp("Bar.Test2.i"),
                generateProp("Bar.Test2.a"),
                generateProp("Bar.Test3.i"),
                generateProp("Bar.Test3.a"),
                generateProp("Foo2")
            ], []);
            expect(els).toHaveLength(15);
            // todo: snapshot
        });

        test("Build Tree with collapsed rows", () => {
            const els = Private.BuildTree([
                generateProp("Foo.Bar.Baz"),
                generateProp("Foo.Bar.Bat"),
                generateProp("Foo.Test"),
                generateProp("Bar.Soap"),
                generateProp("Foo2")
            ], ["Bar", "Foo.Bar"]);
            expect(els).toHaveLength(5);
        });
    });

    describe("function* optToProperty", () => {
        test("should return collapsed row", () => {
            const els = [...Private.optToProperty(
                generateProp("Foo.Bar.Baz"),
                ["Foo.Bar"],
                []
            )];
            expect(els).toHaveLength(2);
            expect(els[1].isCollapsed).toBeTruthy();
        });

        test("should not return child of collapsed row", () => {
            const els = [...Private.optToProperty(
                generateProp("Foo.Bar.Baz"),
                ["Foo.Bar"],
                ["Foo", "Bar"]
            )];
            expect(els.length).toBe(0);
        });

        test("should yield unvisited parents of collapsed rows", () => {
            const els = [...Private.optToProperty(
                generateProp("Foo.Bar.Baz.Bat"),
                ["Foo", "Foo.Bar"],
                ["Foo"]
            )];
            expect(els).toHaveLength(0);
        });

        test("should yield new parents of row", () => {
            const els = [...Private.optToProperty(
                generateProp("Foo.Bar.Baz"),
                [],
                []
            )];
            expect(els.length).toBe(3);
            expect(els[0].isParent).toBeTruthy();
            expect(els[0].name).toEqual("Foo");
            expect(els[1].isParent).toBeTruthy();
            expect(els[1].name).toEqual("Bar");
            expect(els[2].isParent).toBeFalsy();
            expect(els[2].name).toEqual("Baz");
        });

        test("should elide already defined parents", () => {
            const els = [...Private.optToProperty(
                generateProp("Foo.Bar.Baz"),
                [],
                ["Foo"]
            )];
            expect(els.length).toBe(2);
            expect(els[0].name).toBe("Bar");
            expect(els[1].name).toBe("Baz");
            expect(els[1].isParent).toBeFalsy();
        });

        test("should create new parents as appropriate", () => {
            const els = [...Private.optToProperty(
                generateProp("Foo.Bar.Baz"),
                [],
                ["Foo", "Bat"]
            )];
            expect(els.length).toBe(2);
            expect(els[0].name).toBe("Bar");
            expect(els[1].name).toBe("Baz");
            expect(els[1].isParent).toBeFalsy();
        });
    });
});
