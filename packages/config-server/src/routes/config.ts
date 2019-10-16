import * as express from "express";
import { DashboardModel } from "../model";
import { getConnection } from "../db";

export async function configRoute() {
    const route = express.Router();
    const connection = await getConnection();
    const repository = connection.getRepository(DashboardModel);

    route.get("/", async (req, res) => {
        const names = await repository.find();
        res.send({data: names.map(i => i.name)});
    });

    route.get("/:dashboardName/?", async (req, res) => {
        const dashboard = await repository.findOne({name: req.params.dashboardName});
        if (dashboard != null) {
            res.contentType("application/json");
            res.send(dashboard.data);
            return;
        } else {
            res.sendStatus(404);
        }
    });

    route.post("/:dashboardName/?", async (req, res, next) => {
        const dashboard = await repository.findOne({name: req.params.dashboardName});
        if (dashboard == null) {
            res.sendStatus(404);
            return;
        }
        dashboard.data = JSON.stringify(req.body);
        try {
            await repository.save(dashboard);
        } catch (err) {
            next(err);
        }
        res.sendStatus(200);
    });

    route.put("/:dashboardName/?", async (req, res, next) => {
        const dashboard = new DashboardModel();
        dashboard.name = req.params.dashboardName;
        if (await repository.findOne(dashboard.name, {select: ["name"]}) != null) {
            res.sendStatus(409);
            return;
        }
        dashboard.data = JSON.stringify(req.body);
        try {
            await repository.save(dashboard);
        } catch (err) {
            next(err);
        }
        res.sendStatus(200);
    });

    route.patch("/:dashboardName/?", async (req, res, next) => {
        const body = req.body;

        const dashboard = await repository.findOne(req.params.dashboardName);

        if (dashboard == null) {
            res.sendStatus(404);
            return;
        }

        try {
            await repository.update({
                name: dashboard.name
            }, {name: body.name});
        } catch (err) {
            next(err);
        }
        res.sendStatus(200);
    });

    route.delete("/:dashboardName/?", async (req, res, next) => {
        const dashboard = await repository.findOne(req.params.dashboardName);

        if (dashboard == null) {
            res.sendStatus(404);
            return;
        }

        try {
            await repository.delete(dashboard);
        } catch (err) {
            next(err);
        }
        res.sendStatus(200);
    });

    return route;
}
