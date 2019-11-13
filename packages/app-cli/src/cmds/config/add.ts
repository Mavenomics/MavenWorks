import { Argv } from "yargs";
import { IConfigArgs } from "../config";

export const command = "add";

export const description = "Add a new object to the Config Server database";

export function builder(yargs: Argv<IConfigArgs>) {
    return yargs
        .commandDir("interviews")
        .demandCommand();
}

export function handler() {}
