declare module "base64-js" {
    export function toByteArray(b64: string): Uint8Array;
    export function byteLength(b64: string): number;
    export function fromByteArray(uint8: Uint8Array): string;
}

declare module "apache-arrow/Arrow.es5.min.js" {
    export * from "apache-arrow";
}