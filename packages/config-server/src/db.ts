import { createConnection, Connection } from "typeorm";
import { getSetting } from "./settings";
import { DashboardModel, UserModel } from "./model";

let connection: Connection | null = null;

export async function getConnection() {
    if (connection != null && connection.isConnected) {
        return connection;
    } else if (connection != null) {
        connection.close();
    }

    connection = await createConnection({
        type: "sqlite",
        database: getSetting("db_file_location") || "./test.sql",
        entities: [
            DashboardModel,
            UserModel
        ],
        synchronize: true,
        logging: getSetting("loglevel") === "debug" || getSetting("loglevel") === "trace"
    });

    return connection;
}
