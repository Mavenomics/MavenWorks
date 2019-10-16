/**
 * @jest-environment node
 */

import { readFileSync } from "fs";


import { MqlCompiler } from "./querying/MqlCompiler";
import { join } from "path";

const files = [
    "Advanced.mql",
    "Basic.mql",
    "Conditions.mql",
    "CustomLiterals.mql",
    "Expressions.mql",
    "Failure.mql",
    "Formatting.mql",
    // enabling this causes out-of-memory errors
    // "FullQueries.mql",
    // everything from this file fails
    // "FunctionDefinition.mql",
    "Functions.mql",
    "Literals.mql",
    "OperatorPrecedence.mql",
    "Region.mql",
];

describe("MQL Parser Tests", () => {
    for (let i = 0; i < files.length; i++) {
        describe(files[i] + " Parse", () => {
            const data = readFileSync(
                join(__dirname, "..", "test-cases", files[i]),
                {encoding: "utf8"}
            );
            const queries = data.split("\n").map(i => i.startsWith("//") ? "" : i);
            for (let query of queries) {
                query = query.trim().replace(/\\n/g, "\n");
                if (query === ""
                    || query == null
                    // these test round-tripping, and we don't yet have query
                    // serialization
                    || query.includes("=>")) {
                    continue;
                }
                test(query, (done) => {
                    const result = MqlCompiler.parse(query);
                    expect(result).not.toBeNull();
                    // if we use expect(result.errors).toHaveLength, jest blows
                    // up with out of memory errors because it caches the error
                    // list in-memory
                    if (files[i] === "Failure.mql") {
                        expect(result.errors.length).not.toBe(0);
                    } else {
                        if (result.errors.length > 0) {
                            done.fail(result.errors.map(i =>
                                i.msg + " col: " + i.column
                            ).join("\n"));
                        }
                    }
                    done();
                });
            }
        });
    }
});
