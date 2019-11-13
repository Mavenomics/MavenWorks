import * as express from "express";
import * as session from "express-session";
import * as hbs from "express-handlebars";
import * as morgan from "morgan";
import * as passport from "passport";
import "reflect-metadata";
import { getSetting, getLogger, getClientSettings } from "./settings";
import { useAuth, registerPassportHandler } from "./auth";
import { getConnection } from "./db";
import { configRoute } from "./routes/config";
import { DashboardModel } from "./model";
import { join } from "path";
import { readFile } from "fs";

const app = express();
const logger = getLogger("Server");
const port = parseInt(getSetting("port") || "3000", 10);
const hostname = getSetting("hostname") || "localhost";

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

const ALLOWED_ORIGINS = (getSetting("allowed_origins") || "").split(",");
app.use((req, res, next) => {
    if (!ALLOWED_ORIGINS.includes("" + req.headers["origin"])) {
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

app.use("/app", express.static("../app-standalone/public", {
    index: false
}));
app.get("/app/*", (_req, res, next) => {
    // TODO: This will not scale well, and like express.static, will bottleneck
    // larger loads. Rework this with either a process cache (behind a flag, so
    // that we can disable it in dev) or have it stat the file first (not great,
    // but will make it fall in line with express.static in terms of impact)
    const indexPath = join(__dirname, "../../app-standalone/public/index.html");
    readFile(indexPath, "utf8", (err, data) => {
        if (err) return next(err); // make the error middleware handle it
        const indexFile = data.replace("%SETTINGS%", JSON.stringify(getClientSettings()));
        res.send(indexFile);
    });
});

setup();

async function setup() {
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
