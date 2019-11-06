#!/usr/bin/env node

import * as yargs from "yargs";

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
    .demandCommand()
    .help()
    .argv;
