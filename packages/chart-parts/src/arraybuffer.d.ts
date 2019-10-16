declare module "arraybuffer-loader!*";

declare module "*.worker.js" {
    class WebpackWorker extends Worker {
        constructor();
    }

    export default WebpackWorker;
}

declare module "!!raw-loader!*" {
    const data: string;
    export default data;
}

declare module "@finos/perspective/dist/umd/psp.async.wasm" {
    const impl: ArrayBuffer;
    export default impl;
}