import { OptionsBag } from "./OptionsBag";
import { Types } from "@mavenomics/coreutils";

const optionsModel = [
    { name: "foo", type: Types.Number, value: 0 },
    { name: "bar", type: Types.Boolean, value: false },
    { name: "baz", type: Types.Array, value: [] },
    { name: "batman", type: Types.String, value: new Array(8).fill(0 / 0).join("") },
];

describe("OptionsBag", () => {
    let bag: OptionsBag;

    beforeEach(() => {
        bag = new OptionsBag(optionsModel);
    });

    describe("#constructor", () => {
        test("should create a new OptionsBag", () => {
            expect(bag).toBeInstanceOf(OptionsBag);
        });

        test("should set the options to their defaults", () => {
            expect([...bag.values()]).toEqual(optionsModel.map(i => i.value));
        });

        test("should accept iterables in it's constructor", () => {
            const val = new OptionsBag(new Set(optionsModel));
            expect(val).toBeInstanceOf(OptionsBag);
        });
    });

    test("should throw when accessing unknown options", () => {
        expect(() => bag.get("thisOptionDoesNotExist")).toThrow();
    });

    describe("Staleness", () => {
        test("should be fresh after init", () => {
            expect(bag.isStale).toBeFalsy();
        });

        test("should stale on setting an option", () => {
            bag.set("foo", 1);
            expect([...bag.getStaleOptions()]).toContain("foo");
        });

        test("should clear staleness with setFresh", () => {
            bag.setFresh();
            expect(bag.isStale).toBeFalsy();
        });

        test("should include error options in staleness", () => {
            bag.setError(["batman"]);
            expect([...bag.getStaleOptions()]).toContain("batman");
        });

        test("should not clear error after another value is set", () => {
            bag.setFresh();
            bag.setError(["batman"]);
            expect([...bag.getStaleOptions()]).toEqual(["batman"]);
            bag.set("foo", 42);
            expect(bag.isStale).toBeTruthy();
            expect([...bag.getStaleOptions()].sort()).toEqual(["batman", "foo"]);
        });

        test("should not clear error with setFresh", () => {
            bag.setFresh();
            bag.clearError();
            bag.setError(["batman"]);
            expect([...bag.getStaleOptions()]).toEqual(["batman"]);
            bag.setFresh();
            expect([...bag.getStaleOptions()]).toEqual(["batman"]);
        });

        test("should clear errors with clearError", () => {
            bag.setError(["batman"]);
            bag.set("foo", 2);
            bag.clearError();
            expect([...bag.getStaleOptions()]).toEqual(["foo"]);
        });

        test("should not set staleness when the value doesn't change", () => {
            bag.setFresh();
            bag.set("foo", Number(bag.get("foo")));
            expect(bag.isStale).toBeFalsy();
        });

        test("#setAllOptionsStale", () => {
            bag.setAllOptionsStale();
            expect([...bag.getStaleOptions()]).toHaveLength(4);
        });

        test("should not duplicate options that are both stale and errored", () => {
            bag.setFresh();
            bag.set("foo", 4);
            bag.setError(["foo"]);
            expect([...bag.getStaleOptions()]).toEqual(["foo"]);
        });
    });

    describe("Binding", () => {
        it("should set a Global binding", () => {
            bag.setBinding("foo", "Global", "Baz");
        });

        it("should allow sets on globally bound options", () => {
            bag.set("foo", 12);
            expect(bag.get("foo")).toEqual(12);
            expect([...bag.getStaleOptions()]).toContain("foo");
        });

        it("should clear bindings", () => {
            bag.clearBinding("foo");
            expect(bag.getMetadata("foo").binding).toBeUndefined();
        });
    });
});
