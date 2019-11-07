import { PartManager } from "./PartManager";
import { Observable } from "rxjs";
import { MessageLoop } from "@phosphor/messaging";
import { AsyncTools, Types } from "@mavenomics/coreutils";
import { PartFactory, Part, OptionsBag } from "@mavenomics/parts";
import { IBindingsEvaluator, BindingsProvider, GlobalsService } from "@mavenomics/bindings";
import wait = AsyncTools.wait;

// JSDOM doesn't include methods for dealing with performance marks and
// measures, even though it includes a mini-Performance API, so we have to mock
// them individually.
performance.mark = jest.fn();
performance.measure = jest.fn();
performance.clearMarks = jest.fn();

describe("PartManager", () => {
    let manager: PartManager;
    let factory: PartFactory;
    const mockGlobalBindingEvaluator: IBindingsEvaluator = {
        evaluate: async (id, expr, globals) => globalsMock.get!(expr),
        getMetadata: jest.fn(),
        getGlobalsForBinding: (expr) => expr,
        name: "Global",
        isDisposed: false,
        dispose: () => {},
        cancel: () => {},
    };
    const mockEvalBindingEvaluator: IBindingsEvaluator = {
        evaluate: jest.fn(() => Promise.resolve(null)),
        getMetadata: jest.fn(),
        getGlobalsForBinding: (expr) => [],
        name: "Eval",
        isDisposed: false,
        dispose: () => {},
        cancel: () => {},
    };
    const bindingsMock: Partial<BindingsProvider> = {
        getBindingEvaluator: (name) => name === "Global" ? mockGlobalBindingEvaluator : mockEvalBindingEvaluator,
        getBindingNames: () => ["Global", "Eval"]
    };
    const globalsMock: Partial<GlobalsService> = {
        OnChange: new Observable(),
        set: jest.fn(),
        get: jest.fn(() => null),
    };

    class FooPart extends Part {
        public static GetMetadata() {
            const metadata = Part.GetMetadata();
            metadata.addOption("myval", Types.Number, 0);
            metadata.addOption("myval2", Types.String, "foo");
            return metadata;
        }

        public initialize = jest.fn(() => Promise.resolve());
        public render = jest.fn((opts: OptionsBag) => {
            this.node.innerText = "" + opts.get("myval");
        });

        constructor(opts: Part.IOptions) {
            super(opts);
        }
    }

    beforeAll(() => {
        factory = new PartFactory();
        factory.registerPart("FooPart", FooPart);
    });

    describe("#constructor", () => {
        it("should create a new PartManager", () => {
            manager = new PartManager({
                globals: globalsMock as GlobalsService,
                bindings: bindingsMock as BindingsProvider,
                factory,
            } as PartManager.IOptions);
            expect(manager).toBeInstanceOf(PartManager);
        });
        afterAll(() => manager.dispose());
    });

    describe("Part manipulations", () => {
        manager = new PartManager({globals: globalsMock as GlobalsService, factory} as PartManager.IOptions);
        let newPart: FooPart;
        it("should add a new part", async () => {
            newPart = await manager.addPart("FooPart") as FooPart;
            expect(manager.getPartById(newPart.uuid)).toEqual(newPart);
        });

        it("should remove a part", () => {
            manager.removePart(newPart);
            expect(manager.getPartById(newPart.uuid)).toBeNull();
        });

        afterAll(() => {
            newPart.dispose();
            manager.dispose();
        });
    });

    describe("Part Framework", () => {
        let newPart: FooPart;

        beforeAll(async () => {
            manager = new PartManager({
                globals: globalsMock as GlobalsService,
                bindings: bindingsMock as BindingsProvider,
                factory
            } as PartManager.IOptions);
            newPart = await manager.addPart("FooPart") as FooPart;
        });

        it("should have called initialize and render", async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(newPart.initialize).toHaveBeenCalled();
            expect(newPart.isInitialized).toBeTruthy();
            expect(newPart.state).toEqual(Part.State.Idle);
            expect(newPart.isIdle).toBeTruthy();
            expect(newPart.render).toHaveBeenCalledTimes(1);
            expect(newPart.node.innerText).toEqual("0");
        });

        xit("should re-render a part after an option changes", async () => {
            // get the options bag so we can set a value in this test
            expect(manager.getPartById(newPart.uuid)).not.toBeNull();
            const bag = (manager as any).optionsBags.get(newPart.uuid)!;
            bag.set("myval", 42);
            await new Promise(res => setTimeout(res, 10));
            expect(newPart.render).toHaveBeenCalledTimes(2);
            expect(newPart.initialize).toHaveBeenCalledTimes(1);
            expect(newPart.node.innerText).toEqual("42");
            expect(newPart.state).toEqual(Part.State.Idle);
        });

        it("should be dirty after an options change", () => {
            expect(manager.isDirty).toBeTruthy();
        });

        afterAll(() => {
            newPart.dispose();
            manager.dispose();
        });
    });

    describe("Part Lifecycle", () => {
        let part: Part | null = null;
        let manager: PartManager;

        beforeEach(() => {
            manager = new PartManager({
                globals: globalsMock as GlobalsService,
                bindings: bindingsMock as BindingsProvider,
                factory
            } as PartManager.IOptions);
        });

        afterEach(() => {
            manager.dispose();
        });

        it("should stop an execution on option error", async () => {
            part = await manager.addPart("FooPart");
            await wait(10); // allow state to settle
            expect(part.state).toBe(Part.State.Idle);
            expect(part.isInitialized).toBeTruthy();
            const bag = manager.getBagById(part.uuid)!;
            // claim that no globals exist
            globalsMock.get = jest.fn(() => { throw Error("no global!"); });
            part.render = jest.fn(() => void 0);
            bag.setBinding("myval", "Global", "thisGlobalDoesNotExist");
            await wait(10); // allow state to settle
            globalsMock.get = jest.fn(() => null);
            expect(part.state).toBe(Part.State.Error);
            expect(part.render).not.toHaveBeenCalled();
            expect(part.isIdle).toBeTruthy();
        });

        it("should allow a new execution to continue after an error", async () => {
            part = await manager.addPart("FooPart");
            await wait(10); // allow state to settle
            part.render = jest.fn(() => {
                throw Error("He's dead, Jim!");
            });
            part.refresh();
            await wait(10); // allow state to settle
            expect(part.state).toBe(Part.State.Error);
            part.render = jest.fn(() => {
                part!.node.innerHTML = "I work!";
            });
            part.refresh();
            await wait(10);
            expect(part.render).toHaveBeenCalled();
            expect(part.state).toBe(Part.State.Idle);
            expect(part.node.innerHTML).toBe("I work!");
        });

        it("should allow a new execution after a binding error", async () => {
            part = await manager.addPart("FooPart");
            await wait(10);
            mockEvalBindingEvaluator.evaluate = jest.fn(() => {
                return Promise.reject(new Error("Nope"));
            });
            const bag = manager.getBagById(part.uuid)!;
            bag.setBinding("myval", "Eval", "bad eval binding", []);
            await wait(10); // allow state to settle
            expect(part.isError).toBeTruthy();
            mockEvalBindingEvaluator.evaluate = jest.fn(() => Promise.resolve(null));
            bag.setBinding("myval", "Eval", "this will work now", []);
            await wait(10);
            expect(part.isError).toBeFalsy();
            expect(part.isIdle).toBeTruthy();
        });

    });

    describe("Options Lifecycle", () => {
        let part: Part;
        let manager: PartManager;
        let bag: OptionsBag;

        beforeEach(async () => {
            manager = new PartManager({
                globals: globalsMock as GlobalsService,
                bindings: bindingsMock as BindingsProvider,
                factory
            } as PartManager.IOptions);
            part = await manager.addPart("FooPart");
            bag = manager.getBagById(part.uuid)!;
            await wait(10); // allow the part to be executed
        });

        afterEach(() => {
            manager.dispose();
        });

        test("Should execute the part with default option values", () => {
            expect(part.state).toBe(Part.State.Idle);
            expect([...bag.values()]).toEqual([0, "foo"]);
        });

        test("Should set Part error when an option errors", async () => {
            // claim that no globals exist
            globalsMock.get = jest.fn(() => { throw Error("no global!"); });
            bag.setBinding("myval", "Global", "doesNotExist");
            await wait(10); // let state settle
            expect(part.state).toBe(Part.State.Error);
            expect((part.stateDetail as Error).message).toEqual(
                expect.stringContaining("Error in Option Evaluation")
            );
            MessageLoop.flush();
            // we test for hidden-ness since Phosphor defined [[isVisible]] as
            // being _both_ not [[isHidden]] and attached to the DOM.
            expect(part["overlay"].isHidden).toBeFalsy();
            globalsMock.get = jest.fn(() => null);
        });

        test("Should not ignore errors when refreshing", async () => {
            // claim that no globals exist
            globalsMock.get = jest.fn(() => { throw Error("no global!"); });
            bag.setBinding("myval", "Global", "doesNotExist");
            await wait(10); // let state settle
            expect(part.state).toBe(Part.State.Error);
            part.refresh();
            await wait(10); // let part re-evaluate
            expect(part.state).toBe(Part.State.Error);
            MessageLoop.flush();
            expect(part["overlay"].isHidden).toBeFalsy();
            globalsMock.get = jest.fn(() => null);
        });

        xtest("Should not ignore errors when setting another option", async () => {
            // claim that no globals exist
            globalsMock.get = jest.fn(() => { throw Error("no global!"); });
            bag.setBinding("myval", "Global", "doesNotExist");
            await wait(10); // let state settle
            expect(part.state).toBe(Part.State.Error);

            bag.set("myval2", "bar");
            await wait(10);
            expect(part.state).toBe(Part.State.Error);

            part.refresh();
            await wait(10); // let part re-evaluate
            expect(part.state).toBe(Part.State.Error);

            globalsMock.get = jest.fn(() => null);
        });
    });
});
