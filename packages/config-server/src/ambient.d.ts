declare module "connect-sqlite3" {
    declare const session = require("express-session");

    declare class Sqlite3Store {
        constructor(options: IOptions);
    };

    declare interface IOptions {
        table?: string,
        db?: string,
        dir?: string,
        concurrentDb?: boolean
    }

    export = (session: session) => typeof Sqlite3Store;
}
