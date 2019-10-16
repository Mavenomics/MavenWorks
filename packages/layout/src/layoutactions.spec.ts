import * as coreutils from "@phosphor/coreutils";

// Mock the UUID generator to force consistent snapshots
(coreutils as any).UUID.uuid4 = jest.fn(() => "<generated>");

// JSDOM doesn't support insertAdjacentElement, but we're not looking at the DOM
// so we don't need to do anything
Element.prototype.insertAdjacentElement = jest.fn();

import { LayoutManager } from "./LayoutManager";
import { Widget } from "@phosphor/widgets";
import { LayoutActions } from "./layoutactions";
import { TabPanelDashboardLayoutRegion } from "./TabPanelLayoutRegion";
import { LayoutSerializer } from "./LayoutSerializer";

const layout = Object.freeze({
    "properties": {},
    "typeName": 0,
    "uuid": "root",
    "children": [{
        "properties": {},
        "typeName": 0,
        "uuid": "d1241f21-346c-46c2-9010-493493fa7ee5",
        "children": [{
                "properties": {
                    "backgroundColor": "red",
                    "prunable": false,
                },
                "typeName": 0,
                "uuid": "e8cb8a20-cd0b-4c53-ac5f-8137dffd95fc",
                "children": []
            }, {
                "properties": {
                    "backgroundColor": "blue",
                    "prunable": false,
                },
                "typeName": 0,
                "uuid": "7f4d05ff-6ccd-4bd7-aac5-93f18e131c6d",
                "children": []
            }
        ]
    }],
});

describe("Layout Actions", () => {
    const layoutManager = new LayoutManager({
        getPartById: () => {
            const widget = new Widget();
            widget.addClass("test_widget");
        }
    } as any, {} as any);

    beforeEach(() => {
        layoutManager.initLayout(layout);
    });

    describe("SurroundWith", () => {
        test("shouldn't allow surrounding root", () => {
            expect(() => LayoutActions.SurroundWith({
                layoutManager,
                target: layoutManager.root.id,
                regionType: LayoutActions.ContainerTypes.TabPanel,
                prunable: false
            })).toThrow();
        });

        test("should surround with containers", () => {
            const target = "e8cb8a20-cd0b-4c53-ac5f-8137dffd95fc";
            LayoutActions.SurroundWith({
                layoutManager,
                target,
                regionType: LayoutActions.ContainerTypes.TabPanel,
                prunable: false
            });
            const parent = layoutManager.getParentRegion(target);
            expect(parent).not.toBeNull();
            expect(parent!.widgets).toHaveLength(1);
            expect(parent).toBeInstanceOf(TabPanelDashboardLayoutRegion);
        });

        test("should set [[prunable]] on generated regions", () => {
            const target = "7f4d05ff-6ccd-4bd7-aac5-93f18e131c6d";
            LayoutActions.SurroundWith({
                layoutManager,
                target,
                regionType: LayoutActions.ContainerTypes.TabPanel,
                prunable: true
            });
            const parent = layoutManager.getParentRegion(target);
            expect(parent!.getLayoutProperty("prunable")).toBeTruthy();
        });
    });

    test("Move to Far Outer Zone", () => {
        const target = "e8cb8a20-cd0b-4c53-ac5f-8137dffd95fc";
        LayoutActions.MoveToRootZone({
            layoutManager,
            target,
            zone: LayoutActions.RootDropZone.FarOuterLeft
        });
        const serializedLayout = LayoutSerializer.toJson(layoutManager.root as any);
        expect(serializedLayout).toMatchSnapshot();
    });

    describe("Relative drop zones", () => {
        const target = "e8cb8a20-cd0b-4c53-ac5f-8137dffd95fc";
        const reference = "7f4d05ff-6ccd-4bd7-aac5-93f18e131c6d";

        test("Move to Center Drop Zone", () => {
            LayoutActions.MoveToRelativeZone({
                layoutManager,
                target,
                reference,
                zone: LayoutActions.RelativeDropZone.Center
            });
            const serializedLayout = LayoutSerializer.toJson(layoutManager.root as any);
            expect(serializedLayout).toMatchSnapshot();
        });

        test("Move to Inner Drop Zone", () => {
            LayoutActions.MoveToRelativeZone({
                layoutManager,
                target,
                reference,
                zone: LayoutActions.RelativeDropZone.InnerRight
            });
            const serializedLayout = LayoutSerializer.toJson(layoutManager.root as any);
            expect(serializedLayout).toMatchSnapshot();
        });

        test("Move to Outer Drop Zone", () => {
            LayoutActions.MoveToRelativeZone({
                layoutManager,
                target,
                reference,
                zone: LayoutActions.RelativeDropZone.OuterRight
            });
            const serializedLayout = LayoutSerializer.toJson(layoutManager.root as any);
            expect(serializedLayout).toMatchSnapshot();
        });
    });
});
