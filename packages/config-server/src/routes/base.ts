import { RequestHandler } from "express";

/** A function that returns a 2-tuple of baseURL and Express router */
export type IRouteFactory = () => Promise<[string, RequestHandler]>;
