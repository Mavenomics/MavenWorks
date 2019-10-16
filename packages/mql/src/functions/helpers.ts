//tslint:disable: max-line-length

/** @deprecated Remove this function */
export function evaluateRowOptionsFast(_dont_care: unknown, options: any, mapFunc?: (o: any) => any): any {
    //This function returns an observable which will return the options all evaluated using the provided row.
    return mapFunc(options);
}
