import { configRoute } from "./config";
import { IRouteFactory } from "./base";
import { proxyFactory } from "./proxy";

export default [
    configRoute,
    proxyFactory,
] as IRouteFactory[];
