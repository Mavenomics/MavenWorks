import { IColumnFormatting } from "./helpers";

export interface IGridContext {
    partId: string;
    grid: any; // TODO: type and eliminate
    pathColumn: number;
    collapseStates: boolean[];
    lastColumn: string | null;
    version: string; //Used to determine if the grid has been reloaded.

    OpenDashboardHover(
        url: string,
        x: number,
        y: number,
        width?: number,
        height?: number
    ): void;

    OpenDashboardPopup(
        url: string,
        x: number,
        y: number,
        width?: number,
        height?: number
    ): void;

    OpenHover(
        html: string,
        clientX: number,
        clientY: number,
        width: number,
        height: number
    ): void;

    OpenTableHover(
        table: any,
        formatting: string,
        popup: boolean,
        x: number,
        y: number,
        width?: number,
        height?: number
    ):void;

    CloseHover(): void;

    get(opt: string): any;
    set(opt: string, val: any): void;

    getColumnFormatting(column: string): Partial<IColumnFormatting>;
    setColumnFormatting(column: string, colFormatting: Partial<IColumnFormatting>): void;
}
