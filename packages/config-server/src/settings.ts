import * as log from "loglevel";
import * as prefix from "loglevel-plugin-prefix";

// offered for intellisense
export type BuiltinSettingsKeys =
    /** The port that the server will bind to internally. */
      "port"
    /** The verbosity of logs sent to stdout */
    | "loglevel"
    /** The 'root', fully-qualified user-facing URL of the server. */
    | "origin"
    /** The local interface that the server should bind to. */
    | "ip"
    /** A comma-separated list of origins for Cross Origin Resource Sharing (CORS). */
    | "allowed_origins"
    /** Whether to enable the server's Cross Origin proxy (/proxy) */
    | "use_cross_origin_proxy"
    /** A comma-separated list of origins to allow in /proxy */
    | "allowed_cors_proxy_origins"
    /** The location of the SqliteDB to use for this server */
    | "db_file_location"
    /** Whether to use user-logins (true) or allow public access (false) */
    | "use_password_auth"
;

const ClientSettingsWhitelist = [
    "origin",
] as const;

const cfg = new Map<BuiltinSettingsKeys, string | null>([
    ["port", "3000"],
    ["loglevel", "debug"],
    ["origin", "http://localhost:3000"],
    ["ip", "localhost"],
    ["allowed_origins", "http://localhost:9090"],
    ["db_file_location", "./test.sql"],
    ["use_password_auth", "false"],
    ["use_cross_origin_proxy", "false"],
    ["allowed_cors_proxy_origins", "http://localhost:9090"]
]);


// load up overrides and integrate them with the settings
for (let name in process.env) {
    if (name.startsWith("CFG_")) {
        // this is an environment var override
        // Canonical form: Settings variables are in lower_snake_case
        let fixedName = name.slice(4).toLocaleLowerCase().replace(/-/g, "_") as BuiltinSettingsKeys;
        if (!cfg.has(fixedName)) {
            log.warn("Saw setting override in environment variables, but no setting matches " + fixedName);
            continue;
        }
        let value = process.env[name] || null;
        if (value === "" || value === "null") {
            value = null;
        }
        cfg.set(fixedName, value == null ? value : value.toLocaleLowerCase());
        if (fixedName === "loglevel") {
            log.setLevel(value as log.LogLevelDesc);
        }
    } else if (name === "LOGLEVEL" || name === "LOG_LEVEL") {
        cfg.set("loglevel", process.env[name] || null);
        log.setLevel((cfg.get("loglevel") || "") as log.LogLevelDesc);
    }
}

prefix.reg(log);
// noinspection JSUnusedGlobalSymbols
prefix.apply(log, {
    template: "[%t] %l (%n):",
    levelFormatter: function (level: string) {
        return (" " + level.toLocaleUpperCase()).slice(-5);
    },
    nameFormatter: function (name?: string) {
        if (name == null) {
            name = "";
        }
        return 10 > name.length ? (name + "          ").slice(0, 10) : name;
    }
});

const logger = log.getLogger("root");

export function getSetting(setting_name: BuiltinSettingsKeys): string | null {
    return cfg.get(setting_name) || null;
}

/**
 * Override a setting in-process, without writing to any settings file.
 *
 * @export
 * @param setting_name The name of the setting to override
 * @param value The new value the overridden setting will take on
 */
export function overrideSetting(setting_name: BuiltinSettingsKeys, value: string | null) {
    cfg.set(setting_name, value);
    if (setting_name === "loglevel") {
        log.setLevel(getSetting("loglevel") as any);
    }
}

export function getLogger(logger_name?: string) {
    if (logger_name != null) {
        return log.getLogger(logger_name);
    }
    return logger;
}

export function getClientSettings() {
    const map: Record<string, string | null> = {
        "enableConfig": "true",
    };
    for (const setting of ClientSettingsWhitelist) {
        map[setting] = getSetting(setting);
    }
    let url = getSetting("origin");
    map["baseUrl"] = url + "/app/";
    map["configUrl"] = url + "/config/";
    if (getSetting("use_password_auth") === "true") {
        map["enableUsers"] = "true";
    } else {
        map["enableUsers"] = "false";
    }
    return map;
}
