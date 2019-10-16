import { Table, Row } from "@mavenomics/table";
import { StartTimingAsync } from "@mavenomics/coreutils";
import { MqlCallback, Callbacks } from "../callbackhelpers";

export type QueryFunctionEval = (funcName: string, args: any) => any;

export class QueryEngine {
    static copyRowRecursive(table: Table, row: Row) {
        row.cloneToTable(table);
        for (let i = 0; i < row.children.length; i++) {
            QueryEngine.copyRowRecursive(table, row.children[i]);
        }
    }

    static copyTableFlat(table: Table) {
        let copy = new Table();
        copy.setColumns(table.columnNames, table.columnTypes);
        for (let i = 0; i < table.rows.length; i++) {
            QueryEngine.copyRowRecursive(copy, table.rows[i]);
        }
        return copy;
    }

    fromTable: (cb: MqlCallback) => Table | Promise<Table>;
    whereClause: (node: Row, cb: MqlCallback) => any;
    groupByClause: GroupByClause;
    orderByClause: OrderByClause;
    havingClause: (node: Row, cb: MqlCallback) => any;
    selectClause: ColumnDefinition[];
    preserveGrouping = true;
    top = -1;
    enableCellErrors = true;
    private parent: QueryEngine;

    constructor(parent: QueryEngine = null) {
        this.parent = parent;
    }

    //These helpers are so that we can pass around the queryengine object and
    // construct a groupby without importing the GroupByClause class.
    //This should only really be used by the query compiler.
    makeGroupBy(resultSelectors: ResultSelector[], withRollup: boolean, withLeaves: boolean) {
        return new GroupByClause(resultSelectors, withRollup, withLeaves);
    }

    makeColumnDef(name: string, selector: ResultSelector) {
        return new ColumnDefinition(name, selector);
    }

    makeSelectStar() {
        let def = new ColumnDefinition("*", () => { return void 0; });
        def.isSelectStar = true;
        return def;
    }

    makeOrderBy(defs: any[]) {
        return new OrderByClause(defs.map(def => new OrderDefinition(def[0], def[1])));
    }

    public execute() {
        return StartTimingAsync("Query", () => this._execute());
    }

    async _execute(): Promise<Table> {
        //From Clause
        let fromTable: Table = <Table>await StartTimingAsync(
            "FromClause",
            () => Callbacks.AsAsync(this.fromTable)(null)
        );
        //Todo: Implement table type checking
        if (fromTable == null || !Array.isArray(fromTable.rows))
            throw new Error("From clause must return a table");
        //Todo: Implement preserve grouping
        fromTable = QueryEngine.copyTableFlat(fromTable); //Don't mutate the original
        let nodes = fromTable.rows;

        //Todo: Fully support selectstar
        if (this.selectClause[0].isSelectStar) {
            this.selectClause = fromTable.columnNames
                .map((name, idx) => this.makeColumnDef(name, (e, cb) => cb(void 0, e.getValue(idx))));
        }

        let outputTable = new Table();
        outputTable.setColumns(this.selectClause.map(c => c.name));

        //Where Clause
        if (this.whereClause) {
            await StartTimingAsync("WhereClause", async () => {
                nodes = await this.whereNodes(nodes);
            });
        }

        let tempTree = new TempNode(null);
        tempTree.node = fromTable.createRow("root");
        nodes.forEach(n => tempTree.node.appendChild(n));
        tempTree.nodes = this.CreateFromRows(nodes);
        tempTree.nodes.forEach(n => n.node._setParent(tempTree.node));
        if (this.groupByClause && this.groupByClause.resultSelectors.length > 0) {
            await StartTimingAsync("GroupByClause", async () => {
                await this.startGroupNodes(tempTree);

                tempTree = this.groupNodes(fromTable, tempTree);
                let getMaxDepth = (n: TempNode): number =>
                    n.nodes.length > 0 ?
                        Math.max.apply(null, n.nodes.map(c => getMaxDepth(c))) :
                        n.level;
                this.applyRollup(tempTree, getMaxDepth(tempTree));
            });

        } else {
            tempTree.isVisible = false; //Hide the root node when not grouping
        }

        if (this.orderByClause) {
            await StartTimingAsync("OrderByClause", async () => {
                await this.startOrderNodes(tempTree);
                this.orderNodes(tempTree);
            });
        }
        if (this.havingClause) {
            await StartTimingAsync("HavingClause", async () => await this.havingNodes(tempTree));
        }

        return await StartTimingAsync(
            "SelectClause",
            () => Callbacks.AsAsync<Table>(this.selectNodes.bind(this))(outputTable, tempTree, null)
        );
    }

    whereNodes(nodes: Row[]) {
        return Callbacks.AsAsync<boolean[]>(this.startWhereClause.bind(this))(nodes)
            .then(visibility => this.finishWhereClause(nodes, visibility));
    }

    startWhereClause(nodes: Row[], done: MqlCallback<boolean[]>) {
        const deferred = new Array(nodes.length);
        for (let i = 0; i < deferred.length; i++) {
            deferred[i] = Callbacks.Trap(this.whereClause.bind(void 0, nodes[i]));
        }
        return Callbacks.All(deferred, done);
    }

    finishWhereClause(nodes: Row[], filterMap: boolean[]) {
        return nodes.filter((n, i) => filterMap[i]);
    }

    selectNodes(outputTable: Table, node: TempNode, parent: Row | null, cb: MqlCallback<Table>) {
        const deferrals = [];
        this._selectNodeChildren(outputTable, [node], parent, deferrals);

        Callbacks.All(deferrals, (err) => {
            if (err) return void cb(err);
            return void cb(void 0, outputTable);
        });
    }

    _selectNodeChildren(
        outputTable: Table,
        nodes: TempNode[],
        parent: Row | null,
        // The function will mutate this directly
        deferrals: ((cb: MqlCallback<void>) => void)[]
    ) {
        for (let i = 0; i < nodes.length; i++) {
            if (outputTable.length === this.top) {
                return deferrals; // no additional deferrals should be added
            }
            const node = nodes[i];
            if (!node.isVisible) {
                // Pass the grandparent if the node isn't visible. This is
                // because we don't support chopped up trees
                this._selectNodeChildren(outputTable, node.nodes, parent, deferrals);
                continue;
            }
            const row = outputTable.createRow(node.node.name);
            if (parent) {
                parent.appendChild(row);
            } else {
                outputTable.appendRow(row);
            }
            const deferral = (cb: MqlCallback<void>) => {
                const deferredSelect = new Array(this.selectClause.length);
                for (let i = 0; i < this.selectClause.length; i++) {
                    deferredSelect[i] = Callbacks.TrapAsResult(
                        this.selectClause[i].resultSelector.bind(void 0, node.node)
                    );
                }
                return void Callbacks.All(deferredSelect, (err, vals) => {
                    if (err) return void cb(err);
                    row["_rowData"] = vals;
                    return void cb(void 0, void 0);
                });
            };
            deferrals.push(deferral);
            this._selectNodeChildren(outputTable, node.nodes, row, deferrals);
        }
    }

    applyRollup(node: TempNode, maxDepth: number) {
        if (node.level !== 0) {
            if (!this.groupByClause.withRollup && node.level + 1 !== maxDepth)
                node.isVisible = false;
            if (!this.groupByClause.withLeaves && node.level === maxDepth)
                node.isVisible = false;
        }
        node.nodes.forEach(c => this.applyRollup(c, maxDepth));
    }

    havingNodes(root: TempNode) {
        return Callbacks.AsAsync(this._havingNodes.bind(this))(root);
    }

    _havingNodes(root: TempNode, cb: MqlCallback) {
        if (root.isVisible) {
            this.havingClause(root.node, (err, res) => {
                if (err) return void cb(err);
                root.isVisible = res;
            });
        }
        let deferred = new Array(root.nodes.length);
        for (let i = 0; i < root.nodes.length; i++) {
            deferred[i] = this._havingNodes.bind(this, root.nodes[i]);
        }
        return Callbacks.All(deferred, cb);
    }

    compareNodes(left: TempNode, right: TempNode) {
        for (let i = 0; i < this.orderByClause.definitions.length; i++) {
            if (left.orderKeys[i] < right.orderKeys[i])
                return this.orderByClause.definitions[i].ascending ? -1 : 1;
            if (left.orderKeys[i] > right.orderKeys[i])
                return this.orderByClause.definitions[i].ascending ? 1 : -1;
        }
        return 0;
    }

    orderNodes(root: TempNode) {
        root.nodes.sort((left, right) => this.compareNodes(left, right));
        root.nodes.forEach(n => this.orderNodes(n));
    }

    startOrderNodes(root: TempNode) {
        return Callbacks.AsAsync(this._startOrderNodes.bind(this))(root);
    }

    async _startOrderNodes(root: TempNode, cb: MqlCallback) {
        root.orderKeys = this.orderByClause ? Array(this.orderByClause.definitions.length) : null;
        const deferred = new Array(this.orderByClause.definitions.length);
        for (let i = 0; i < this.orderByClause.definitions.length; i++) {
            let def = this.orderByClause.definitions[i];
            deferred[i] = def.resultSelector.bind(void 0, root.node);
        }
        Callbacks.All(deferred, (err, res) => {
            if (err) return void cb(err);
            root.orderKeys = res;
            const deferred = new Array(root.nodes.length);
            for (let i = 0; i < deferred.length; i++) {
                deferred[i] = this._startOrderNodes.bind(this, root.nodes[i]);
            }
            return void Callbacks.All(deferred, cb);
        });
    }

    startGroupNodes(root: TempNode) {
        return Callbacks.AsAsync(this._startGroupNodes.bind(this))(root.nodes);
    }

    groupNodes(outputTable: Table, root: TempNode) {
        let newRoot = this.CreateFromRow(outputTable.createRow("root"));
        newRoot.nodes = this._groupNodes(outputTable, root.nodes, 1);
        newRoot.nodes.forEach(c => newRoot.node.appendChild(c.node));

        return newRoot;
    }

    private _startGroupNodes(nodes: TempNode[], cb: MqlCallback<void>) {
        let settledRows = 0;
        for (let i = 0; i < nodes.length; i++) {
            let cur = nodes[i];
            cur.groupKeys = this.groupByClause ? Array(this.groupByClause.resultSelectors.length) : null;
            const deferred = new Array(this.groupByClause.resultSelectors.length);
            for (let selectorIdx = 0; selectorIdx < this.groupByClause.resultSelectors.length; selectorIdx++) {
                deferred[selectorIdx] = this.groupByClause.resultSelectors[selectorIdx].bind(void 0, cur.node);
            }
            Callbacks.All(deferred, (err, keys) => {
                settledRows++;
                if (err) return void cb(err);
                cur.groupKeys = keys;
                if (settledRows === nodes.length) {
                    return void cb(void 0, void 0);
                }
            });
        }
    }

    private _groupNodes(outputTable: Table, nodes: TempNode[], level: number) {
        let buckets = new Map();
        for (let i = 0; i < nodes.length; i++) {
            let cur = nodes[i];
            cur.level = level + 1;
            let key = cur.groupKeys[level - 1];
            let bucket = buckets.get(key);
            if (bucket == null) {
                bucket = [cur];
                buckets.set(key, bucket);
            } else {
                bucket.push(cur);
            }
        }
        let aggregatedNodes: TempNode[] = [];
        buckets.forEach((val, key) => {
            let newNode = new TempNode(outputTable.createRow(key));
            newNode.nodes = level < this.groupByClause.resultSelectors.length ?
                this._groupNodes(outputTable, val, level + 1) :
                val;
            newNode.name = key;
            newNode.level = level;
            newNode.nodes.forEach(c => newNode.node.appendChild(c.node));
            aggregatedNodes.push(newNode);

        });
        return aggregatedNodes;
    }

    private CreateFromRows(rows: Row[]) {
        return rows.map(r => this.CreateFromRow(r));
    }

    private CreateFromRow(row: Row) {
        let orderByCount = this.orderByClause ? this.orderByClause.definitions.length : 0;
        let groupByCount = this.groupByClause ? this.groupByClause.resultSelectors.length : 0;
        let node = new TempNode(row);
        node.nodes = row.children.map(r => this.CreateFromRow(r));
        return node;
    }

}

class TempNode {
    isVisible: boolean;
    node: Row;
    nodes: TempNode[];
    level: number;
    name: any;
    groupKeys: any[];
    orderKeys: any[];

    constructor(node: Row) {
        this.node = node;
        this.nodes = [];
        this.isVisible = true;
        this.level = 0;
        this.name = null;
        this.orderKeys = null;
        this.groupKeys = null;
    }
}

export class ColumnDefinition {
    resultSelector: ResultSelector;
    name: string;
    isSelectStar: boolean;

    constructor(name: string, resultSelector: ResultSelector) {
        this.resultSelector = resultSelector;
        this.name = name;
    }
}

export type ResultSelector = (node: Row, cb: MqlCallback) => any | Promise<any>;

export class GroupByClause {
    resultSelectors: ResultSelector[];
    withRollup: boolean;
    withLeaves: boolean;

    constructor(resultSelectors: ResultSelector[], withRollup: boolean, withLeaves: boolean) {
        this.resultSelectors = resultSelectors;
        this.withRollup = withRollup;
        this.withLeaves = withLeaves;
    }
}

export class OrderDefinition {
    resultSelector: ResultSelector;
    ascending: boolean;

    constructor(resultSelector: ResultSelector, ascending: boolean) {
        this.resultSelector = resultSelector;
        this.ascending = ascending;
    }
}

export class OrderByClause {
    definitions: OrderDefinition[];

    constructor(definitions: OrderDefinition[]) {
        this.definitions = definitions;
    }
}

export interface IQueryContext {
    nop(): void;
}
