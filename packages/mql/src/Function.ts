import { IFunctionEvaluatorContext } from "./functionExecution";
import * as _ from "lodash";
import { Callbacks, MqlCallback } from "./callbackhelpers";
import { Row } from "@mavenomics/table";

export abstract class IFunction {
    evalCall(
        row: Row,
        optionLookup: {
            [id: string]: (row: Row, cb: MqlCallback) => void;
        },
        context: IFunctionEvaluatorContext,
        cb: MqlCallback
    ): any {
        let _called = false;
        let done = (err, res) => {
            if (_called) throw Error("done() called multiple times!");
            _called = true;
            cb(err, res);
        };

        const callbacks = [];
        const obj = {};
        for (const key in optionLookup) {
            if (key === "row") continue;
            if (!optionLookup.hasOwnProperty(key)) continue;
            const callback = optionLookup[key];
            if (callback == null) continue;
            if (Array.isArray(callback)) {
                callbacks.push((cb) => Callbacks.All(
                    callback.map(i => i.bind(void 0, row)),
                    (err, res) => {
                        if (err) return void cb(err);
                        obj[key] = res;
                        return void cb(void 0, void 0);
                    }
                ));
                continue;
            }
            callbacks.push((cb) => callback(row, (err, res) => {
                if (err) return void cb(err);
                obj[key] = res;
                return void cb(void 0, void 0);
            }));
        }

        return Callbacks.All(callbacks, (err) => {
            if (err) {
                return void cb(err);
            }
            const computedOptions = obj;
            computedOptions["row"] = row;
            let res: any;
            try {
                res = this.eval(computedOptions, context, done);
            } catch (err) {
                return void cb(err);
            }

            // a ghost wrote this

            if (res instanceof Promise) {
                res.then(
                    val => done.call(void 0, void 0, val),
                    err => done.call(void 0, err)
                );
                return;
            } else if (res !== undefined) {
                done.call(void 0, void 0, res);
            }
        });
    }

    abstract eval(
        optionLookup: { [id: string]: any; },
        context: IFunctionEvaluatorContext,
        done: MqlCallback<any>
    ): Promise<any> | any | void;

}
