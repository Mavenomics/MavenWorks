import { overrideSetting, getLogger, getConnection, UserModel, DashboardModel } from "@mavenomics/config-server";
import { Argv, Arguments } from "yargs";
import { IConfigArgs } from "../config";

interface IRemoveObjArgs extends IConfigArgs {
    key: string;
    type: "user" | "dashboard";
}

export const command = "remove [type] [key]";

export const aliases = ["rm"];

export const description = "Remove an object from the Config Server database";

export function builder(yargs: Argv<IRemoveObjArgs>) {
    return yargs
        .positional("type", {
            type: "string",
            describe: "The type of config object to remove",
            choices: ["user", "dashboard"]
        })
        .positional("key", {
            type: "string",
            describe: "The key of the object to remove",
            normalize: true
        })
        .demandOption(["type", "key"]);
}


export async function handler({
    dryRun,
    type,
    key,
    loglevel
}: Arguments<IRemoveObjArgs>) {
    overrideSetting("loglevel", loglevel);
    const logger = getLogger("remove");

    if (type == null) {
        throw Error("Object type cannot be null");
    }

    if (key == null || key === "") {
        throw Error("Object key cannot be null");
    }

    let modelType;

    switch (type) {
        case "user":
            modelType = UserModel;
            break;
        case "dashboard":
            modelType = DashboardModel;
            break;
        default:
            throw new Error("Invalid model type");
    }

    logger.info("Connecting to DB...");
    const connection = await getConnection();
    logger.info("Connected");

    const repo = connection.getRepository<UserModel | DashboardModel>(modelType);

    const toRemove = await repo.findOne(key);

    if (toRemove == null) {
        throw new Error("Could not find object at " + key);
    }

    if (dryRun) {
        console.log("Would've deleted the " + type + " at " + key);
        return process.exit(0);
    }

    await repo.delete(toRemove);
    console.log("Successfully deleted " + key);
}
