import * as log from "loglevel";
import * as prefix from "loglevel-plugin-prefix";

// offered for intellisense
export type BuiltinSettingsKeys =
      "port"
    | "loglevel"
    | "hostname"
    | "protocol"
    | "allowed_origins"
    | "db_file_location"
    | "ssl_key"
    | "ssl_cert"
    | "use_password_auth"
;

const cfg = new Map<BuiltinSettingsKeys, string | null>([
    ["port", "3000"],
    ["loglevel", "debug"],
    ["hostname", "localhost"],
    ["protocol", "http"],
    ["allowed_origins", "http://localhost:9090"],
    ["db_file_location", "./test.sql"],
    ["ssl_key", null],
    ["ssl_cert", null],
    ["use_password_auth", "false"],
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
    } else if (name === "LOGLEVEL" || name === "LOG_LEVEL") {
        cfg.set("loglevel", name);
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
