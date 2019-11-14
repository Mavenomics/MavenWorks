#!/usr/bin/env node

import * as yargs from "yargs";

export interface IGlobalArgs {
    loglevel: "trace" | "debug" | "info" | "warn" | "error" | "silent";
}


// tslint:disable-next-line: no-unused-expression
yargs
    .option("loglevel", {
        alias: "log",
        default: "info",
        choices: ["trace", "debug", "info", "warn", "error", "silent"],
        describe: "The server log level",
        type: "string",
    })
    .global("loglevel")
    .scriptName("mavenworks")
    .commandDir("cmds")
    .demandCommand(1)
    .help()
    .check((argv, opts) => {
        // cf. https://github.com/yargs/yargs/issues/1076#issue-298894729
        // It looks like yargs doesn't support strict mode for positional params
        // if any command consumes them...
        if (argv._.length === 0) {
            return true;
        }
        // If the config subcommands are there, complain about _that_
        // to let the user know that they need cfg
        if (["add", "list", "ls", "rm", "remove"].includes(argv._[0])) {
            return "Could not parse arguments. Config commands must be " +
            "prepended with 'config'. Try:\n\n\t$ mavenworks config "
            + argv._.join(" ");
        }
        // ¯\_(ツ)_/¯
        return "Too many positional arguments were passed.";
    })
    .strict()
    .argv;
