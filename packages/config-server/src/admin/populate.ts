import { getConnection } from "../db";
import { DashboardModel } from "../model";
import { getLogger } from "../settings";
import * as commander from "commander";

/** Prepopulate the config DB with 2 example dashboards. */
async function prepopulate() {
    logger.info("Connecting to DB...");
    const connection = await getConnection();
    const repository = connection.getRepository(DashboardModel);
    logger.info("Connected.");
    const model = new DashboardModel();
    // tslint:disable-next-line: max-line-length
    model.data = String.raw`{"layout":{"properties":{},"children":[],"typeName":0,"uuid":"test"},"metadata":{},"parts":{},"visual":true}`;
    model.name = "Empty Dashboard";
    const model2 = new DashboardModel();
    // tslint:disable-next-line: max-line-length
    model2.data = String.raw`{"layout":{"properties":{},"typeName":0,"uuid":"838018f5-8ca0-450d-8ad8-782aa12ee272","attachedProperties":[{"Fixed Size (px)":null,"Stretch":1.5154536390827518}],"children":[{"properties":{"prunable":true,"horizontal":true},"typeName":0,"uuid":"d79faf7b-ac8c-4f89-a4be-49d4cf2937c5","attachedProperties":[{"Fixed Size (px)":null,"Stretch":1.147445971063844},{"Fixed Size (px)":null,"Stretch":1.3666948007751278}],"children":[{"properties":{"caption":"TableEditor"},"typeName":1,"uuid":"79ddcc5a-db4c-425e-94b7-73692919a015","guid":"448014a3-e1e0-47eb-8313-f10f3d517e0a"},{"properties":{"caption":"SlickGrid","showRegion":true},"typeName":1,"uuid":"2f674e16-f4fb-4c9a-979c-a308e0477fe1","guid":"SlickGrid"}]}]},"parts":{"SlickGrid":{"application/vnd.maven.part+json":{"name":"SlickGrid","id":"SlickGrid","options":{"Input Table":{"type":"Global","expr":"tbl","globals":["tbl"]},"Formatting":{"typeName":"String","value":"{\"x\":{\"General.DisplayStyle\":\"ProgressBar\",\"General.ColumnWidthPixels\":\"105\",\"Number.FormatString\":\"0.00%\"}}"}}},"text/plain":"VisualEditorPart"},"448014a3-e1e0-47eb-8313-f10f3d517e0a":{"application/vnd.maven.part+json":{"name":"TableEditor","id":"448014a3-e1e0-47eb-8313-f10f3d517e0a","options":{"Input Data":{"type":"Global","expr":"tbl","globals":["tbl"]}}},"text/plain":"VisualEditorPart"}},"metadata":{},"globals":[{"name":"x","type":"Number","value":0.5},{"name":"tbl","type":"Table","value":{"rows":[{"data":[{"typeName":"Number","value":0.5625},{"typeName":"Number","value":1},{"typeName":"String","value":"22"}],"name":"null"},{"data":[{"typeName":"Number","value":0.2562},{"typeName":"Number","value":2},{"typeName":"Number","value":2.5}],"name":"null"},{"data":[{"typeName":"Number","value":0.3129},{"typeName":"Number","value":3},{"typeName":"Number","value":3.5}],"name":"null"},{"data":[{"typeName":"Number","value":0.734},{"typeName":"Number","value":4},{"typeName":"String","value":"56"}],"name":"null"},{"data":[{"typeName":"Number","value":0.5},{"typeName":"Number","value":50},{"typeName":"String","value":"55"}],"name":"null"},{"data":[{"typeName":"Number","value":0.1258},{"typeName":"Number","value":6},{"typeName":"Number","value":6.5}],"name":"null"},{"data":[{"typeName":"Number","value":0.7521},{"typeName":"Number","value":7},{"typeName":"Number","value":7.5}],"name":"null"},{"data":[{"typeName":"Number","value":0.5732},{"typeName":"Number","value":8},{"typeName":"Number","value":8.5}],"name":"null"},{"data":[{"typeName":"Number","value":0.6173},{"typeName":"Number","value":9},{"typeName":"Number","value":9.5}],"name":"null"},{"data":[{"typeName":"Number","value":0.0855},{"typeName":"Number","value":10},{"typeName":"Number","value":10.5}],"name":"null"}],"cols":["x","i","i+@x"],"types":["Any","Any","Any"]}}],"localParts":{}}`;
    model2.name = "Table Editor Demo";

    logger.info("Writing to DB...");
    await repository.save(model);
    await repository.save(model2);
}

const program = commander
    .version("0.1.0")
    .description("Prepopulate the config DB with 2 example dashboards");

program.parse(process.argv);

const logger = getLogger();

prepopulate().then(() => {
    logger.info("Done.");
    process.exit(0);
}).catch(err => {
    logger.error("Failed to populate config DB!");
    logger.error(err);
    process.exit(1);
});
