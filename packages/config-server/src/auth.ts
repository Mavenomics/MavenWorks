import { UserModel } from "./model";
import { getSetting, getLogger } from "./settings";
import * as bcrypt from "bcrypt";
import * as express from "express";
import * as passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { getConnection } from "./db";

declare global {
    namespace Express {
        // Override the User type in PassportJS with our user class
        interface User extends UserModel {
            id?: string;
        }
    }
}

export function useAuth() {
    const logger = getLogger("Auth");
    const route = express.Router();
    logger.debug("Loading Auth endpoint");
    const usePasswordAuth = getSetting("use_password_auth") !== "false";

    if (!usePasswordAuth) {
        logger.debug("Disabling password auth as configured");
        return [((_1, _2, next) => next()) as express.RequestHandler, route] as const;
    }

    const auth: express.RequestHandler = (req, res, next) => {
        // always allow OPTIONS requests
        if (req.user != null || req.method === "OPTIONS") return next();
        passport.authenticate("local",
            (err, user, info) => {
                if (err) return next(err instanceof Error ? err : Error(err));
                if (!user) {
                    res.setHeader("WWW-Authenticate", "ConfigLogin");
                    return res.status(401).send(info.message);
                }
                req.login(user, (err) => {
                    if (err) return next(err instanceof Error ? err : Error(err));
                    next();
                });
            }
        )(req, res, next);
    };

    route.post("/login", (req, res, next) => {
        if (req.user != null) return res.send({isLoggedIn: true, reason: "Already logged in"});
        passport.authenticate("local",
            (err, user, info) => {
                if (err) return next(err instanceof Error ? err : Error(err));
                if (!user) {
                    return res.status(401)
                        .send({isLoggedIn: false, reason: info.message});
                }
                req.login(user, (err) => {
                    if (err) return next(err instanceof Error ? err : Error(err));
                    logger.info("User logged in", user.username);
                    res.send({isLoggedIn: true});
                });
            }
        )(req, res, next);
    });

    route.get("/logout", (req, res) => {
        if (req.user != null) {
            logger.info("User logged out", req.user.id);
            req.logout();
        }
        res.sendStatus(200);
    });

    route.get("/status", (req, res) => {
        return res.send({"isLoggedIn": req.user != null});
    });

    return [auth, route] as const;
}

export async function registerPassportHandler() {
    const connection = await getConnection();
    const repository = connection.getRepository(UserModel);

    passport.use(new LocalStrategy({},
        async (username, password, done) => {
            const user = await repository.findOne(username);
            if (user == null) {
                return done(null, false, {message: "Incorrect username."});
            }
            if (await bcrypt.compare(password, user.password)) {
                return done(null, user);
            } else {
                return done(null, false, {message: "Incorrect password."});
            }
        }
    ));

    passport.serializeUser((user: any, done) => {
        done(null, user.username);
    });
    passport.deserializeUser(async (id: string, done) => {
        let user = await repository.findOne(id);
        if (user == null) return done(Error("Not found: " + id));
        return done(null, {
            provider: "local",
            id: user.username,
            displayName: user.username
        });
    });
}
