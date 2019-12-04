import { start, overrideSetting } from "@mavenomics/config-server";
import { Arguments, Argv } from "yargs";
import * as open from "open";
import { IGlobalArgs } from "..";

export const command = "serve";

export const aliases = ["$0"] as const;

export const describe = "Start the Config Server";

interface IArgs extends IGlobalArgs {
    hostname: string;
    port: number;
    allowed_origins: string[];
    browser: boolean;
    users: boolean;
}

export function builder(yargs: Argv<IArgs>) {
    return yargs
        .option("hostname", {
            alias: ["host", "ip"],
            default: "localhost",
            describe: "Hostname or IP",
            type: "string",
            requiresArg: true,
        })
        .option("port", {
            alias: ["p"],
            default: 9090,
            describe: "Network port",
            type: "number",
            requiresArg: true,
        })
        .option("allowed_origins", {
            default: [],
            type: "array",
            describe: "CORS allowed origins. CORS is a browser security feature " +
            "that allows defense-in-depth against XSS attacks. If you intend to " +
            "communicate with this server from another app, add the HTTP Origin " +
            "that your app will be served from to this array.\n" +
            "Note that the 'star' origin (`*`) is intentionally _not_ supported. " +
            "You must supply explicit origin names.",
            example: "--allowed_origins http://example.org http://example.com http://example.org:4242",
            requiresArg: true,
        })
        .option("browser", {
            default: true,
            type: "boolean",
            describe: "Whether to open a browser window. Use --no-browser to " +
            "disable.",
        })
        .option("users", {
            default: false,
            type: "boolean",
            describe: "Flag to enable user-based authentication in the CLI. If " +
            "true, users will need to sign in before being able to access and " +
            "modify config objects. The app will prompt them for this when required."
        })
        .check((argv, opts) => {
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
        // Leave this as a local checker! Otherwise it won't let downstream commands
        // consume arguments!
        }, false)
        .strict();
}

export async function handler({
    port,
    hostname,
    allowed_origins,
    loglevel,
    browser,
    users,
}: Arguments<IArgs>) {
    overrideSetting("loglevel", loglevel);
    overrideSetting("hostname", hostname);
    overrideSetting("port", "" + port);
    overrideSetting("allowed_origins", allowed_origins.join(","));
    overrideSetting("use_password_auth", "" + users);
    if (hostname.length < 1) {
       throw new Error("Hostname cannot be null");
    }
    if (Number.isNaN(port)) {
        throw new Error("Port cannot be null");
    }
    if (!Number.isInteger(port) || port < 0 || port > 65536) {
        throw new Error("Port must be an integer between 1 and 65535, inclusive.");
    }
    console.log("Launching server at " + hostname + ":" + port + "...");
    return start(() => {
        if (!browser) return; // user disabled the auto open explicitly
        const url = `http://${hostname}:${port}`;
        open(url);
    });
}
