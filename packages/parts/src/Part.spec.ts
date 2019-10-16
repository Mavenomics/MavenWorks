import { Types } from "@mavenomics/coreutils";
import { Part } from "./Part";
import { OptionsBag } from "./OptionsBag";
import { PartFactory } from "./PartFactory";
import { MessageLoop } from "@phosphor/messaging";

class FooPart extends Part {
    public static GetMetadata() {
        const metadata = Part.GetMetadata();
        metadata.addOption("foo", Types.Number, 0);
        return metadata;
    }

    public initialize = jest.fn(() => Promise.resolve());
    public render = jest.fn((opts: OptionsBag) => {
        this.node.innerText = "" + opts.get("myval");
    });
}

let factory: PartFactory;

describe("Part", () => {
    beforeEach(() => {
        // stub out definitions
        factory = new PartFactory();
        factory.registerPart("FooPart", FooPart);
    });

    describe("#constructor", () => {
        it("should create a new part", () => {
            // create a stub part
            const part = factory.createPart("FooPart", {} as Part.IOptions);
            expect(part).not.toBeNull();
            expect(part.state).toBe(Part.State.Uninitialized);
            expect(part.isInitialized).toBeFalsy();
            expect(part.isIdle).toBeTruthy();
        });
    });

    describe("#processMessage", () => {
        let part: Part;

        beforeEach(() => {
            part = factory.createPart("FooPart", {} as Part.IOptions);
        });

        it("should respond to lifecycle messages", () => {
            MessageLoop.sendMessage(part, Part.Lifecycle.BeforeInitialize);
            MessageLoop.flush(); //process all messages synchronously
            expect(part.state).toBe(Part.State.Initializing);
            expect(part.isIdle).toBeFalsy();
            MessageLoop.sendMessage(part, Part.Lifecycle.AfterInitialize);
            MessageLoop.flush();
            expect(part.state).toBe(Part.State.Idle);
            expect(part.isIdle).toBeTruthy();
            expect(part.isInitialized).toBeTruthy();
        });

        it("should respond to error messages", () => {
            part.error("test", "init-error");
            MessageLoop.flush();
            expect(part.state).toBe(Part.State.Error);
            expect(part.isIdle).toBeTruthy();
        });

        it("should not allow error state to block state changes", () => {
            part.error("test", "init-error");
            MessageLoop.flush();
            expect(part.state).toBe(Part.State.Error);
            MessageLoop.sendMessage(part, Part.Lifecycle.BeforeCalculate);
            MessageLoop.sendMessage(part, Part.Lifecycle.AfterCalculate);
            MessageLoop.flush();
            expect(part.state).toBe(Part.State.Idle);
        });

        it("should respond to option calculations", () => {
            MessageLoop.sendMessage(part, Part.Lifecycle.BeforeCalculate);
            MessageLoop.flush();
            expect(part.state).toBe(Part.State.Calculating);
            expect(part.isIdle).toBeFalsy();
            part.optionCalculating("before-option-calc", "foo");
            MessageLoop.flush();
            expect(part.stateDetail).toEqual(["foo"]);
            part.optionCalculating("after-option-calc", "foo");
            MessageLoop.flush();
            expect(part.stateDetail).toEqual([]);
            expect(part.state).toBe(Part.State.Calculating);
            expect(part.isIdle).toBeFalsy();
            MessageLoop.sendMessage(part, Part.Lifecycle.AfterCalculate);
            MessageLoop.flush();
            expect(part.state).toBe(Part.State.Idle);
            expect(part.isIdle).toBeTruthy();
        });
    });
});
