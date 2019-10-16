import { UUID } from "@phosphor/coreutils";

/**
 * Note: This doesn't expose a way of showing these timing trees to users, they
 * only exist right now as a glorified form of console.log. When we find a
 * thread-local storage mechanism we like, we can re-implement true timing trees
 */

export function StartTimingWithContext<T>(
    name: string,
    func: () => Promise<T>
): Promise<{ error: null, result: T, context: null } | { error: any, result: null, context: null }> {
    const guid = UUID.uuid4();
    performance.mark(guid + "start");
    // also use console.time
    console.time(name + " [guid:" + guid + "]");
    return Promise.resolve()
    .then(() => func())
    .then((res) => {
        return {error: null, result: res, context: null};
    }).catch(err => {
        return {error: err, result: null, context: null};
    }).then((res) => {
        // this executes for either promise state
        console.timeEnd(name + " [guid:" + guid + "]");
        performance.mark(guid + "end");
        performance.measure(name, guid + "start", guid + "end");
        performance.clearMarks(guid + "start");
        performance.clearMarks(guid + "end");
        return res;
    });
}

//This is the general timing function that user code will use.
export function StartTiming<T>(name: string, func: () => Promise<T>): Promise<T> {
    return StartTimingWithContext<T>(name, func)
        .then(timing => timing.error != null ? Promise.reject<T>(timing.error) : timing.result!);
}

export function StartTimingSync<T>(name: string, func: () => T): T {
    const guid = UUID.uuid4();
    performance.mark(guid + "start");
    console.time(name + " [guid:" + guid + "]");
    let res: T | undefined;
    let err: Error | undefined;
    try {
        res = func();
    } catch (e) {
        err = e;
    } finally {
        console.timeEnd(name + " [guid:" + guid + "]");
        performance.mark(guid + "end");
        performance.measure(name, guid + "start", guid + "end");
        performance.clearMarks(guid + "start");
        performance.clearMarks(guid + "end");
    }
    // re-throw any errors after clearing marks
    if (err != null) {
        throw err;
    }
    return res!;
}

export async function StartTimingAsync<T>(name: string, func: () => Promise<T>): Promise<T> {
    const guid = UUID.uuid4();
    performance.mark(guid + "start");
    console.time(name + " [guid:" + guid + "]");
    let res: T | undefined;
    let err: Error | undefined;
    try {
        res = await func();
    } catch (e) {
        err = e;
    } finally {
        console.timeEnd(name + " [guid:" + guid + "]");
        performance.mark(guid + "end");
        performance.measure(name, guid + "start", guid + "end");
        performance.clearMarks(guid + "start");
        performance.clearMarks(guid + "end");
    }
    // re-throw any errors after clearing marks
    if (err != null) {
        throw err;
    }
    return res!;
}
