import { start, overrideSetting } from "@mavenomics/config-server";
import { Arguments } from "yargs";
import { IGlobalArgs } from "..";

export const command = "serve";

export const aliases = ["$0"] as const;

export const describe = "Start the Config Server";

export const builder = {
    "hostname": {
        alias: ["host", "ip"],
        default: "localhost",
        describe: "Hostname or IP",
        type: "string",
        requiresArg: true,
    },
    "port": {
        alias: ["p"],
        default: 9090,
        describe: "Network port",
        type: "number",
        requiresArg: true,
    },
    "allowed_origins": {
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
    }
};

interface IArgs extends IGlobalArgs {
    hostname: string;
    port: number;
    allowed_origins: string[];
}

export async function handler({ port, hostname, allowed_origins, loglevel }: Arguments<IArgs>) {
    overrideSetting("loglevel", loglevel);
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
    return start(port, hostname, allowed_origins);
}
