import { Argv } from "yargs";
import { IGlobalArgs } from "..";

export interface IConfigArgs extends IGlobalArgs {
    dryRun: boolean;
}

export const command = "config";

export const aliases = ["cfg"];

export const description = "Manage objects in the Config Server database";

export function builder(yargs: Argv<IConfigArgs>) {
    return yargs
        .option("dryRun", {
            alias: ["dry-run", "d"],
            type: "boolean",
            default: false,
            description: "Print actions to the console instead of committing them"
        })
        .global("dryRun")
        .commandDir("config")
        .demandCommand();
}

export function handler() {}
