import {
    overrideSetting,
    getLogger,
    getConnection,
    UserModel,
    DashboardModel,
    getPrimaryKey
} from "@mavenomics/config-server";
import { Argv, Arguments } from "yargs";
import { IConfigArgs } from "../config";

interface IListObjArgs extends IConfigArgs {
    type: "user" | "dashboard" | "all";
}

export const command = "list [type]";

export const aliases = ["ls"];

export const description = "List objects in the config, optionally filtered on " +
    "object type";

export function builder(yargs: Argv<IListObjArgs>) {
    return yargs
        .positional("type", {
            type: "string",
            describe: "The type of config object to remove",
            choices: ["user", "dashboard", "all"],
            default: "all"
        });
}

export async function handler({
    type,
    loglevel
}: Arguments<IListObjArgs>) {
    overrideSetting("loglevel", loglevel);
    const logger = getLogger("list");

    logger.info("Connecting to DB...");
    const connection = await getConnection();
    logger.info("Connected");

    let toList = [];

    switch (type) {
        case "user":
            toList = [UserModel];
            break;
        case "dashboard":
            toList = [DashboardModel];
            break;
        case "all":
            toList = [UserModel, DashboardModel];
            break;
        default:
            throw new Error("Invalid model type");
    }

    for (const model of toList) {
        const repo = connection.getRepository<any>(model);
        console.log(model.name + "s in config:");
        for (const obj of await repo.find()) {
            console.log("  ", obj[getPrimaryKey(obj)]);
        }
    }
}
