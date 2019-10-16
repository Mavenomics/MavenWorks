import * as fetchMock from "fetch-mock";
import { HttpConfigManager } from "./config";
import { DashboardSerializer } from "@mavenomics/dashboard";
import { ConfigError, AuthenticationError } from "./errors";

const MOCK_CFG_URL = "http://localhost:3000";
const MOCK_DASHBOARD_PATH = "/foo";
const MOCK_UNKNOWN_DASHBOARD = "/bar";
const MOCK_EXT_CFG_URL = "http://localhost:4242";

describe("HttpConfigManager", () => {
    const manager = new HttpConfigManager(MOCK_CFG_URL);

    beforeAll(() => {
        fetchMock
            .get(MOCK_CFG_URL + MOCK_DASHBOARD_PATH, DashboardSerializer.DEFAULT_DASHBOARD)
            .get(MOCK_CFG_URL + MOCK_UNKNOWN_DASHBOARD, 404)
            .put(MOCK_CFG_URL + MOCK_DASHBOARD_PATH, 409)
            .get(MOCK_EXT_CFG_URL, 401)
            .patch(MOCK_CFG_URL + MOCK_UNKNOWN_DASHBOARD, 200);
    });

    test("#getDashboard", async () => {
        // test that it was issued correctly, nothing more
        const res = await manager.getDashboard(MOCK_DASHBOARD_PATH);
        expect(res).toMatchObject(DashboardSerializer.DEFAULT_DASHBOARD);
    });

    test("#newDashboard", () => {
        expect(manager.newDashboard(
            MOCK_UNKNOWN_DASHBOARD,
            DashboardSerializer.DEFAULT_DASHBOARD
        )).resolves.toBeNull();
    });

    describe("Errors", () => {
        test("Not found", () => {
            expect(manager.getDashboard(MOCK_UNKNOWN_DASHBOARD))
                .rejects
                .toBeInstanceOf(ConfigError);
        });

        test("Already exists", () => {
            expect(manager.newDashboard(
                    MOCK_DASHBOARD_PATH,
                    DashboardSerializer.DEFAULT_DASHBOARD
                ))
                .rejects
                .toBeInstanceOf(ConfigError);
        });

        test("Authentication", () => {
            const newManager = new HttpConfigManager(MOCK_EXT_CFG_URL);
            expect(newManager.getDashboard(MOCK_DASHBOARD_PATH))
                .rejects
                .toBeInstanceOf(AuthenticationError);
        });
    });
});
