import { getConnection } from "../db";
import { UserModel } from "../model";
import { getLogger } from "../settings";
import * as bcrypt from "bcrypt";
import * as commander from "commander";
import * as read from "read";

const BCRYPT_SALT_ROUNDS = 12;

const program = commander
    .version("0.1.0")
    .description("Manage users in the config DB")
    .option("-d, --dry-run", "Don't commit any changes to the database");

const logger = getLogger("Users");

program.command("add <username>")
    .description("Adds a user to the config, prompting for a password")
    .action(async (username, cmd) => {
        logger.info("Connecting to DB...");
        const connection = await getConnection();
        logger.info("Connected");
        const repository = connection.getRepository(UserModel);
        let user = await repository.findOne(username);
        if (user != null) {
            logger.error("User " + username + " already exists in the config!");
            return process.exit(1);
        }
        user = new UserModel();
        user.username = username;
        const pwd = await new Promise((resolve, reject) => read({
                prompt: "Password: ",
                silent: true,
                replace: "*",
            }, (err, res) => {
                if (err) reject(err); else resolve(res);
            })
        );
        user.password = await bcrypt.hash(pwd, BCRYPT_SALT_ROUNDS);
        if (program.dryRun) {
            logger.info("Would've written the following record to the DB:");
            logger.info("   username=" + user.username);
            logger.info("   password=<omitted: bcrypt hash>");
            return process.exit(0);
        }
        logger.info("Writing to DB...");
        await repository.save(user);
        logger.info("Done.");
        return process.exit(0);
    });

program.command("remove <username>")
    .description("Deletes a user from the config")
    .action(async (username, cmd) => {
        logger.info("Connecting to DB...");
        const connection = await getConnection();
        logger.info("Connected");
        const repository = connection.getRepository(UserModel);
        let user = await repository.findOne(username);
        if (user == null) {
            logger.error("User " + username + " does not exist in the config!");
            return process.exit(1);
        }
        if (program.dryRun) {
            logger.info("Would've deleted the following record from the DB:");
            logger.info("   username=" + user.username);
            logger.info("   password=<omitted: bcrypt hash>");
            return process.exit(0);
        }
        logger.info("Writing to DB...");
        await repository.delete(user);
        logger.info("Done.");
        return process.exit(0);
    });

program.parse(process.argv);
