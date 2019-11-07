import * as bcrypt from "bcrypt";
import * as read from "read";
import { Argv, Arguments } from "yargs";
import { overrideSetting, getLogger, getConnection, UserModel } from "@mavenomics/config-server";
import { IConfigArgs } from "../../config";

// TODO: Move this into the settings, with a minimum of 12
const BCRYPT_SALT_ROUNDS = 12;

interface IAddUserArgs extends IConfigArgs {
    username?: string;
}

export const command = "user [username]";

export const description = "Add a new user";

export function builder(yargs: Argv<IAddUserArgs>) {
    return yargs
        .positional("username", {
            type: "string",
            describe: "The username of the new user to add"
        });
}

export async function handler({
    dryRun,
    username,
    loglevel
}: Arguments<IAddUserArgs>) {
    overrideSetting("loglevel", loglevel);
    const logger = getLogger("Users");

    logger.info("Connecting to DB...");
    const connection = await getConnection();
    logger.info("Connected");

    const repo = connection.getRepository(UserModel);

    while (username == null || username === "") {
        // interview for a username
        username = await new Promise((resolve, reject) => read({
                prompt: "Username: ",
            }, (err, res) => {
                if (err) reject(err); else resolve(res);
            })
        );
        if (username == null || username === "") {
            console.error("Invalid username: username cannot be null");
            continue;
        }
        const model = await repo.findOne(username);

        if (model != null) {
            console.error("Invalid username: user already exists in config!");
            username = undefined;
        }
    }

    const newModel = new UserModel();
    newModel.username = username;

    const pwd = await new Promise((resolve, reject) => read({
            prompt: "Password: ",
            silent: true,
            replace: "*",
        }, (err, res) => {
            if (err) reject(err); else resolve(res);
        })
    );
    newModel.password = await bcrypt.hash(pwd, BCRYPT_SALT_ROUNDS);

    if (dryRun) {
        console.log("Would've written the following record to the DB:");
        console.log("   username=" + newModel.username);
        console.log("   password=<omitted: hashed password>");
        return process.exit(0);
    }
    logger.info("Writing to DB...");
    await repo.save(newModel);
    logger.info("Done.");
}
