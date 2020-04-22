import { PartFactory, Part } from "@mavenomics/parts";
import { Dashboard } from "./Dashboard";
import { DashboardSerializer } from "./DashboardSerializer";
import { AsyncTools, Types } from "@mavenomics/coreutils";

jest.mock("@mavenomics/bindings/lib/MqlWorkerPool");

// JSDOM doesn't include methods for dealing with performance marks and
// measures, even though it includes a mini-Performance API, so we have to mock
// them individually.
performance.mark = jest.fn();
performance.measure = jest.fn();
performance.clearMarks = jest.fn();

describe("Dashboard", () => {
    let dashboard: Dashboard;
    const factory = new PartFactory();
    const SIMPLE_DASHBOARD = Object.freeze({
        globals: [{
            name: "asdf",
            type: "String",
            value: "asdf"
        }],
        layout: {
            typeName: 0,
            children: [{
                typeName: 1,
                properties: {},
                uuid: "2",
                guid: "bar"
            }],
            properties: {},
            uuid: "1"
        },
        parts: {
            "bar": {
                "application/vnd.maven.part+json": {
                    id: "bar",
                    name: "FooPart",
                    options: {
                        "bat": {
                            type: "Global",
                            expr: "asdf",
                            globals: ["asdf"]
                        }
                    }
                }
            }
        }
    } as DashboardSerializer.ISerializedDashboard);

    beforeAll(() => {
        factory.registerPart("FooPart", class extends Part {
            public static GetMetadata() {
                const metadata = super.GetMetadata();
                metadata.addOption("baz", Types.String, "");
                metadata.addOption("bat", Types.String, "");
                return metadata;
            }
            public initialize() { }
            public render() { this.node.textContent = "foo"; }
        });
    });

    beforeEach(() => {
        dashboard = new Dashboard({
            factory: factory,
            baseUrl: "/",
            baseViewUrl: "/"
        });
    });

    test("can instantiate", () => {
        expect(dashboard.isDisposed).toBeFalsy();
        expect(dashboard.node.className).toMatch(/m\-Dashboard/);
    });

    test("is not dirty after loading a dashboard", async () => {
        await dashboard.loadFromModel(SIMPLE_DASHBOARD);
        await AsyncTools.wait(10); // allow state to settle
        // ie, part manager
        expect(dashboard.isDirty).toBeFalsy();
        expect(dashboard.shouldNotifyDirty).toBeFalsy();
    });

    test("is not notifyDirty after setting a global", async () => {
        await dashboard.loadFromModel(SIMPLE_DASHBOARD);
        await AsyncTools.wait(10);
        expect(dashboard.isDirty).toBeFalsy();
        dashboard.globals.set("asdf", "foobar");
        await AsyncTools.wait(10);

        expect(dashboard.isDirty).toBeTruthy();
        expect(dashboard.shouldNotifyDirty).toBeFalsy();
    });

    test("is notifyDirty after changing an unbound option", async () => {
        await dashboard.loadFromModel(SIMPLE_DASHBOARD);
        await AsyncTools.wait(10);
        expect(dashboard.isDirty).toBeFalsy();
        const bag = dashboard.partManager.getBagById("bar")!;
        bag._setExternal("baz", "test test 1 2 3");
        await AsyncTools.wait(10); // allow part manager state to settle
        expect(dashboard.isDirty).toBeTruthy();
        expect(dashboard.shouldNotifyDirty).toBeTruthy();
    });

    test("is clean after calling setClean", async () => {
        await dashboard.loadFromModel(SIMPLE_DASHBOARD);
        await AsyncTools.wait(10);
        expect(dashboard.isDirty).toBeFalsy();
        const bag = dashboard.partManager.getBagById("bar")!;
        bag._setExternal("baz", "test test 1 2 3");
        await AsyncTools.wait(10); // allow part manager state to settle
        expect(dashboard.isDirty).toBeTruthy();
        dashboard.setClean();
        expect(dashboard.isDirty).toBeFalsy();
        expect(dashboard.shouldNotifyDirty).toBeFalsy();
    });
});
