import { getSetting } from "./settings";
import { start } from "./app";

const port = parseInt(getSetting("port") || "3000", 10);
const hostname = getSetting("hostname") || "localhost";
const allowed_origins = (getSetting("allowed_origins") || "").split(",");

start(port, hostname, allowed_origins);
