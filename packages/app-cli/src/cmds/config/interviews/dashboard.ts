import { Argv, Arguments } from "yargs";
import { overrideSetting, getLogger, getConnection, DashboardModel } from "@mavenomics/config-server";
import { IConfigArgs } from "../../config";
import { readFile } from "fs";

interface IAddDashboardArgs extends IConfigArgs {
    name: string;
    path?: string;
}

export const command = "dashboard [name] [path]";

export const description = "Add a new dashboard. Optionally, import from an " +
    "exported .dashboard file at [path].";

export function builder(yargs: Argv<IAddDashboardArgs>) {
    return yargs
        .positional("name", {
            type: "string",
            describe: "The name of the new dashboard to add",
        })
        .positional("path", {
            type: "string",
            describe: "A path pointing to a `.dashboard` to import",
            normalize: true
        })
        .demandOption(["name", "path"]);
}

export async function handler({
    dryRun,
    name,
    path,
    loglevel
}: Arguments<IAddDashboardArgs>) {
    overrideSetting("loglevel", loglevel);
    const logger = getLogger("Dashboard");

    if (name == null || name === "") {
        throw Error("Dashboard name cannot be null");
    }

    if (path == null || path === "") {
        throw Error("Dashboard path cannot be null");
    }

    const dashboardData = await new Promise<string>((resolve, reject) => readFile(
        path,
        { encoding: "utf8", flag: "r" },
        (err, data) => {
            if (err) { return reject(err); }
            try {
                // parse the file as a safety check, but throw it away since we
                // actually don't need the parsed model.
                JSON.parse(data);
            } catch (err) {
                return reject(new Error("Dashboard file is not valid JSON!"));
            }
            return resolve(data);
        }
    ));

    logger.info("Connecting to DB...");
    const connection = await getConnection();
    logger.info("Connected");

    const repo = connection.getRepository(DashboardModel);

    const model = await repo.findOne(name);

    if (model != null) {
        throw new Error("Invalid name: dashboard already exists in config!");
    }

    const newModel = new DashboardModel();
    newModel.name = name;
    newModel.data = dashboardData;

    if (dryRun) {
        console.log("Would've written the following record to the DB:");
        console.log("   name=" + newModel.name);
        console.log("   data=<omitted: JSON model>");
        return process.exit(0);
    }
    logger.info("Writing to DB...");
    await repo.save(newModel);
    logger.info("Done.");
}
