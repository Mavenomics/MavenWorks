import { Router, Request, Response, NextFunction } from "express";
import { PromiseDelegate } from "@phosphor/coreutils";
import { getSetting, getLogger } from "../settings";
import * as http from "http";
import * as https from "https";

/** Note:
 *
 * This route exposes a same-origin proxy to cross-origin services,
 * **defeating** many cross-origin protections in HTTP (such as Content Security
 * Policies and Cross Origin Resource Sharing).
 *
 * As such, this is off-by-default and uses a whitelist to ensure that only
 * trusted domains are added to this proxy. The point is to allow users and
 * dashboard developers to access services that may not be properly setup for
 * secure cross-origin requests, or may impose restrictions on same.
 *
 * This proxy only implements GET and POST- future verbs can be added on an
 * as-needed basis
 */

export const endpoint = "/proxy";

export async function proxyFactory() {
    const useProxy = getSetting("use_cross_origin_proxy") === "true";
    const logger = getLogger("Proxy");
    const router = Router();

    if (!useProxy) {
        logger.debug("Disabling cross-origin proxy as configured");
        // return a no-op handler
        return [endpoint, router];
    }

    const whitelistOrigins = (
        getSetting("allowed_cors_proxy_origins") || ""
    ).split(",");
    const whitelist = new Set<string>();
    for (const origin of whitelistOrigins) {
        try {
            whitelist.add(new URL(origin).origin);
        } catch (err) {
            logger.warn("Invalid URL: " + origin + ". Skipping");
        }
    }

    function checkUrl(req: Request, res: Response, next: NextFunction) {
        const origin =  new URL(req.params.url).origin;
        if (!whitelist.has(origin)) {
            return res.status(403).send("Origin not allowed");
        }
        return next();
    }

    interface IResponse {
        statusCode: number;
        headers: Record<string, string>;
        body: Buffer;
    }

    function cleanHeaders(
        headers: http.OutgoingHttpHeaders
    ): Record<string, string> {
        const cleanHeaders: Record<string, string> = {};
        // taken from MDN: https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name
        const blacklistedHeaders = [
            "accept-charset",
            "accept-encoding",
            "access-control-request-headers",
            "access-control-request-method",
            "connection",
            "content-length",
            "cookie",
            "cookie2",
            "date",
            "dnt",
            "expect",
            "host",
            "keep-alive",
            "origin",
            "referer",
            "te",
            "trailer",
            "transfer-encoding",
            "upgrade",
            "via",
        ];
        for (const [key, value] of Object.entries(headers)) {
            if (value == null) continue;
            const headerKey = key.toLocaleLowerCase();

            if (blacklistedHeaders.includes(headerKey)) continue;
            if (headerKey.startsWith("proxy-") || headerKey.startsWith("sec-")) continue;

            const headerValue = Array.isArray(value) ? value.join(",") : ("" + value);
            cleanHeaders[headerKey] = headerValue;
        }
        return cleanHeaders;
    }

    function makeRequest(
        url: URL,
        method?: "GET" | "POST",
        headers?: Record<string, string>,
        body?: string,
    ): Promise<IResponse> {
        logger.info("Cross Origin: " + method + " " + url);
        const agent = (url.protocol === "https:" ? https : http);
        let defer = new PromiseDelegate<IResponse>();
        const req = agent.request(
            url,
            {
                method,
                headers
            },
            (res) => {
                const buffers: Buffer[] = [];
                res.on("data", (chunk) => buffers.push(chunk));
                res.on("close", () => {
                    logger.info(`Cross Origin (response): ${res.statusCode} ${res.statusMessage}: ${method} ${url}`);
                    defer.resolve({
                        body: Buffer.concat(buffers),
                        headers: res.headers as Record<string, string>,
                        statusCode: res.statusCode || 200
                    });
                    req.abort();
                });
                res.on("error", (err) => {
                    defer.reject(err);
                    req.abort();
                });
            }
        );
        req.on("error", (err) => {
            defer.reject(err);
            req.abort();
        });
        if (method === "POST") {
            if (typeof body !== "string") {
                body = JSON.stringify(body);
            }
            req.write(body, (err) => {
                if (!err) return;
                defer.reject(err);
                req.abort();
            });
        }
        req.end();
        return defer.promise;
    }

    async function proxyAndReturnResult(req: Request, res: Response, next: NextFunction) {
        const url = new URL(req.params["url"]);
        let result: IResponse;
        try {
            result = await makeRequest(
                url,
                req.method as "GET" | "POST",
                cleanHeaders(req.headers),
                req.body
            );
        } catch (err) {
            // pass down the error to the error handler
            return next(err);
        }
        res.status(result.statusCode);
        // TODO: Evaluate if we'll need a header whitelist
        for (const [header, value] of Object.entries(result.headers)) {
            res.setHeader(header, value);
        }
        res.send(result.body);
    }

    router.get("/:url", checkUrl, proxyAndReturnResult);
    router.post("/:url", checkUrl, proxyAndReturnResult);

    return [endpoint, router];
}
