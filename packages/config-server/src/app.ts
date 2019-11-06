import * as express from "express";
import * as session from "express-session";
import * as hbs from "express-handlebars";
import * as morgan from "morgan";
import * as passport from "passport";
import "reflect-metadata";
import { getLogger } from "./settings";
import { useAuth, registerPassportHandler } from "./auth";
import { getConnection } from "./db";
import { configRoute } from "./routes/config";
import { DashboardModel } from "./model";
import { join, resolve } from "path";

export async function start(
    port: number,
    hostname: string,
    allowed_origins: string[],
    base_dir = join(__dirname, "../../app-standalone/public")
) {
    const app = express();
    const logger = getLogger("Server");
    // resolve the absolute path and normalize
    base_dir = resolve(base_dir);

    app.use(morgan("combined"));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    // TODO: Pull in session secret from random var or config setting?
    app.use(session({secret: "TEST"}));
    app.use(passport.initialize());
    app.use(passport.session());

    app.set("view engine", ".hbs");
    app.engine(".hbs", hbs({
        extname: ".hbs",
        defaultLayout: null as any
    }));

    app.use((req, res, next) => {
        if (!allowed_origins.includes("" + req.headers["origin"])) {
            // don't include CORS headers if the origin isn't whitelisted
            return next();
        }
        res.setHeader("Access-Control-Allow-Origin", "" + req.headers["origin"]);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT,PATCH,DELETE");
        next();
    });

    const [auth, authRoute] = useAuth();

    app.use("/user", authRoute);

    app.use("/app", express.static(base_dir));
    // catch all for path URLs
    app.get("/app/*", (_req, res) => res.sendFile(join(base_dir, "index.html")));

    logger.debug("Connecting to DB...");
    const conn = await getConnection();
    const repository = conn.getRepository(DashboardModel);
    logger.info("Connected to DB");

    logger.debug("Registering Passport JS handler...");
    await registerPassportHandler();

    logger.debug("Registering API routes...");
    const route = await configRoute();
    app.use("/config", auth, route);

    route.get("/dashboards", auth, async (_req, res) => {
        const names = await repository.find();
        res.render("dashboards", {
            dashboards: names.map(i => i.name)
        });
    });

    // force all traffic to the app
    app.get("/", (_req, res) => res.redirect("/app"));

    app.listen(port, hostname, () => logger.info("Now listening on", port));
}
