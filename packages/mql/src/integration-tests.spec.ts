import { RunMql } from "./RunMql";
import { IFunctionEvaluatorContext } from "./functionExecution";
import { FindFunctionInfo, GetAllFunctions, RegisterFunction } from "./functionFactory";
import { CancelToken, IterTools, Types } from "@mavenomics/coreutils";
import { TableHelper, Table, Row } from "@mavenomics/table";
import Papa = require("papaparse");
import { IFunction } from "./Function";
import { declareFunction, functionArg } from "./FunctionDecorators";
import fetch from "node-fetch";

// tslint:disable: max-line-length

// JSDOM doesn't include methods for dealing with performance marks and
// measures, even though it includes a mini-Performance API, so we have to mock
// them individually.
performance.mark = jest.fn();
performance.measure = jest.fn();
performance.clearMarks = jest.fn();

const queries = [
    `SELECT x FROM Lattice('x = 1 to 10 step 1')`,
    `SELECT * FROM Lattice('x = 1 to 3 step 1')`,
    `SELECT x -2 FROM Lattice('x = 1 to 3 step 1')`,
    `SELECT x -2 FROM Lattice('x = 1 to 3 step 1')`,
    `SELECT JsEval('Math.sin(x)', 'x', x) FROM Lattice('x = 1 to 3 step 1')`,
    `SELECT x FROM Lattice('x = 1 to 5 step 1') GROUP BY x`,
    `SELECT x FROM Lattice('x = 1 to 5 step 1') GROUP BY x`,
    `SELECT Sum(x + 1) FROM Lattice('x = 1 to 5 step 1, y = 1 to 3 step 1') GROUP BY x WITH ROLLUP`,
    `SELECT Sum(x) FROM Lattice('x = 1 to 5 step 1') GROUP BY x WITH ROLLUP`,
    `set @table = Lattice( 'x = 1 to 3 step 1, y = 7 to 10 step 1' )
    SELECT
        x,
        y,
        sum( x + y ),
        ParentVal( sum( x + y ) ),
        RootVal( sum( x + y ) )
    FROM
        @table
    GROUP BY
        x
    WITH ROLLUP`,
    `SELECT GetName(), GetPath() FROM dual GROUP BY 1, 2, 3, 'foo' WITH ROLLUP`,
    // PnL6 query, modified to just return the length of sparklines instead of the whole thing
    `
set @SliderValues = <<csv
value,label
0.42,AUD
0.03,CAD
0.04,CHF
0.11,DKK
0.11,EUR
0.1,GBP
0.01,HKD
0,ILS
0.43,JPY
0.23,NOK
0,NZD
0.21,SEK
0.38,SGD
0.12,USD
csv

set @ConfidenceLevelPct = 0.42
set @StartDate = 19980119
set @EndDate = 20090714

set @Data = Cache( 'Data1', Subselect( <<mql
    set @Pnl5MipWeeklyPath = WorkerCache(
        'pnl5_weekly',
        Fetch('https://dl.dropboxusercontent.com/s/ktez6tnglllde8z/PNL_Export_MIP_16Y_weekly.csv')
    )
    set @Pnl5MipExpPath = WorkerCache(
        'pnl5_exposures',
        Fetch('https://dl.dropboxusercontent.com/s/fj9xltj4f5azde6/PNL_Export_MIP_Exposures.csv')
    )
    set @rawTable = ExcelCsvToTable( @Pnl5MipWeeklyPath )
    set @tableWithFakeDates = Cache(
        'TWFD',
        AddComputedColumn( @rawTable, 'Fake Date', AddTime(Date(2012,06,14),  0, 0, -(858-[Scenario Index])*7 ))
    )
    SELECT
        Currency,
        [Book Value] as BookValue,
        VectorsToSparkline(
            DateTimeVectorFromTable( 'Fake Date', @tableWithFakeDates ),
            FloatVectorFromTable( Currency, @rawTable )
        ) as Scenarios
    FROM
        ExcelCsvToTable( @Pnl5MipExpPath )
mql
) )
set @FilteredData1 = Cache( Rand(  ), Subselect( <<mql
    set @NumDate = GetYears( Date ) * 10000 + GetMonths( Date ) * 100 + GetDays( Date )
    SELECT First(Currency) as Currency,
        First(BookValue) as BookValue,
        Sparkline(Scenarios, Date) as Scenarios
    FROM Explode(@Data)
    WHERE @NumDate >= @StartDate and @NumDate <= @EndDate
    GROUP BY Currency
    HAVING GetLevel() = 1
mql
, 'Data', @Data, 'StartDate', @StartDate, 'EndDate', @EndDate ) )
set @FilteredData2 = Cache( Rand(  ), Subselect( <<mql
    SELECT Currency as Currency2,
            Scenarios as Scenarios2
    FROM @FilteredData1
mql
, 'FilteredData1', @FilteredData1 ) )

set @MinThreshold = 65
set @ExposureSelectionType = 'Use Sliders'
set @MinThresholdScaled = 0.65
set @ShowGrid = False
set @ShowSliders = True
set @RowPath = '/root/AUD'
set @RowName = 'AUD'
set @CellContents = 'AUD'
set @MessageType = 'SelectedCellChanged'
set @WeightedSchenarioTotal = SparklineSum( SparklineMultiply( @ValueUsed / BookValue, Scenarios ) )
set @PNLVector = Cache(
    IfElse( @IsTotal, 'Grand Total', First( Currency ) ),
    SparklineToFloatVector( SparklineSum( @WeightedSchenarioTotal ) )
)
set @ConfidenceLevel = @ConfidenceLevelPct
set @tailLength = Ceiling( Length( @PNLVector ) * ( 1 - @ConfidenceLevel ) )
set @SliderAdjustedValue = Weight / RootVal( Sum( Weight ) ) * RootVal( Sum( BookValue ) )
set @ValueUsed = @SliderAdjustedValue
set @IsTotal = GetLevel(  ) = 0
set @WeightTable = RemoveColumns(
    AddComputedColumn( CsvToTable( @SliderValues ), 'Currency', label, 'Weight', value ),
    'RowName'
)
def @tailScenFilter(@value) = @value = Idx( SortVector( @PNLVector ), @tailLength )
set @tailScenarioIndex = Cache( 'tsi', RootVal( FirstIndexWhere( @PNLVector, @tailScenFilter, 0 ) ) )

SELECT
    Sum( @ValueUsed ) as [Book Value Used],
    IfElse( @IsTotal, null, Sum( @ValueUsed ) / RootVal( Sum( @ValueUsed ) ) ) as [%],
    Length(@WeightedSchenarioTotal) as PseudoScenarios,
    - Idx( SortVector( @PNLVector ), @tailLength ) as VaR,
    Idx( @PNLVector, @tailScenarioIndex ) / RootVal( Idx( @PNLVector, @tailScenarioIndex ) ) as [VaR Contribution],
    - VectorSum( Slice( SortVector( @PNLVector ), 0, @tailLength ) ) / @tailLength as ETL,
    - ( VectorSum( Slice( SortVector( @PNLVector ), 0, @tailLength ) ) / @tailLength ) / Sum( @ValueUsed ) as [ ETL %]
FROM
    FullOuterNaturalJoin( 'Currency', @FilteredData1, @WeightTable )
GROUP BY
    Currency
    WITH ROLLUP NO LEAVES
ORDER BY
    GetName(  )`,
    // Fund Summary dashboard, modified to return length of sparklines
    `
SET @positionDataSource = Subselect(<<MQL
    SET @histories = Subselect(<<HistoryMQL
        SELECT
            First(symbol) as symbol,
            Sparkline(price_adjclose, trade_date) as history
        FROM WorkerCache('position_historicalData', CsvToTable(Fetch('https://dl.dropboxusercontent.com/s/5xlr22jszzgb5zb/historicalData.csv')))
        GROUP BY symbol
        HAVING GetLevel() != 0
HistoryMQL
    )
    SELECT
        (symbol) as symbol,
        (history) as history,
        (sector) as sector,
        (industry) as industry,
        (description) as description,
        (totalcash) as totalcash,
        (totaldebt) as totaldebt,
        (bookvalue) as bookvalue,
        (PE) as PE,
        (cashflow) as cashflow,
        (shares_outstanding) as shares_outstanding,
        (FTE) as FTE,
        desk,
        quantity,
        YTD_PnL,
        MTD_PnL,
        WTD_PnL,
        DTD_Realized_PnL,
        average_price_outstanding,
        SparklineToFloatVector(history) as price_adjclose,
        latestprice
    FROM ChangeRowName(
        InnerNaturalJoin(
        'symbol',
        InnerNaturalJoin(
            'symbol',
            InnerNaturalJoin('symbol', CsvToTable(Fetch('https://dl.dropboxusercontent.com/s/hyw2xiszh2p258w/SecurityWithFlags.csv')), @histories),
            CsvToTable(Fetch('https://dl.dropboxusercontent.com/s/eckzx8ns1qh7zk5/position.csv'))),
        RenameColumn(CsvToTable(Fetch('https://dl.dropboxusercontent.com/s/fweovng9csl7mng/latestprice.csv')), 'price_adjclose', 'latestprice')),
        symbol)
MQL
)

set @DataSourceLastAppliedView = 'Team~PnL'
set @ExposurePct = sum( ifelse( quantity != null, quantity * latestprice, 0 ) ) / RootVal( sum( ifelse( quantity != null, quantity * latestprice, 0 ) ) )
set @ExposureLimit = 0.1
SELECT TOP 20
    symbol as symbol ,
    '' as [ ],
    quantity as Quantity,
    latestprice as [Last Price],
    ifelse( symbol != null, '?src:url=demos/PnlTreemapHover.dashboard&width=800&height=600&symbol="' || symbol || '"', null ) as Beta,
    sum( DTD_Realized_PnL ) as [P&L.DTD.Realized],
    sum( DTD_Realized_PnL ) as DTD_Realized_PnL,
    sum( GetOpenUnrealized( price_adjclose, latestprice, quantity ) ) as [P&L.DTD.Unrealized],
    sum( DTD_Realized_PnL + GetOpenUnrealized( price_adjclose, latestprice, quantity ) ) as [P&L.DTD.Total],
    ifelse( symbol != null, Length( history ), null) as AdjClosePriceHistory,
    sum( DTD_Realized_PnL + GetOpenUnrealized( price_adjclose, latestprice, quantity ) ) / ( sum( ifelse( quantity != null, quantity * latestprice, 0 ) ) - sum( DTD_Realized_PnL + GetOpenUnrealized( price_adjclose, latestprice, quantity ) ) ) as [P&L.DTD.Total DTD % of Net Exposure],
    sum( WTD_PnL ) as [P&L.WTD.Base],
    sum( WTD_PnL + DTD_Realized_PnL + GetOpenUnrealized( price_adjclose, latestprice, quantity ) ) as [P&L.WTD.Total],
    sum( MTD_PnL ) as [P&L.MTD.Base],
    sum( MTD_PnL + DTD_Realized_PnL + GetOpenUnrealized( price_adjclose, latestprice, quantity ) ) as [P&L.MTD.Total],
    sum( YTD_PnL ) as [P&L.YTD.Base],
    sum( YTD_PnL + DTD_Realized_PnL + GetOpenUnrealized( price_adjclose, latestprice, quantity ) ) as [P&L.YTD.Total],
    sum( ifelse( quantity != null, quantity * latestprice, 0 ) ) as [Net Exposure],
    sum( ifelse( quantity != null, abs( quantity * latestprice ), 0 ) ) / RootVal( sum( ifelse( quantity != null, abs( quantity * latestprice ), 0 ) ) ) as [Gross Exposure % of Total],
    sum( ifelse( quantity != null, abs( quantity * latestprice ), 0 ) ) / ParentVal( sum( ifelse( quantity != null, abs( quantity * latestprice ), 0 ) ) ) as [Gross Exposure % of Parent]
FROM
    @positionDataSource
WHERE
    desk in ( 'Example 130/30' )
GROUP BY
    ColumnTag( 'Total' ),
    desk,
    ColumnTag( ifelse( quantity > 0, 'Long', quantity < 0, 'Short', 'Flat' ), 'LongShort', 'LongShort', '[DataSource.Column Key] := ''LongShort''', null ),
    ColumnTag( sector, 'sector', 'sector', '[DataSource.Column Key] := ''sector''', null ),
    ColumnTag( industry, 'industry', 'industry', '[DataSource.Column Key] := ''industry''', null )
    WITH ROLLUP
HAVING
    GetLevel(  ) != 0
ORDER BY
    ifelse( GetLevel(  ) = 4, first( quantity ), null )`,
`set @tbl = Subselect(<<MQL
    SELECT
        x,
        y,
        ifelse(x % 2 > 0, null, x + y) as s1,
        x + y as s2,
        ifelse(x % 2 > 0, JsEval('return NaN'), 2) as n1,
        2 as n2,
        ifelse(x % 2 > 0, Infinity, 1) as i1,
        1 as i2
    FROM
        Lattice('x = 1 to 10 step 1, y = 1 to 3 step 1')
MQL
)

SELECT
    sum(s1) as [s1.sum],
    avg(s1) as [s1.avg],
    s1 as [s1.ref],
    s2 as [s1.nodrop],
    sum(n1) as [n1.sum],
    avg(n1) as [n1.avg],
    n1 as [n1.ref],
    n2 as [n1.nodrop],
    sum(i1) as [i1.sum],
    avg(i1) as [i1.avg],
    i1 as [i1.ref],
    i2 as [i1.nodrop]
FROM
    @tbl
GROUP BY y WITH ROLLUP`,
`SELECT
    GetLevel( ),
    GetName( ),
    GetPath( )
FROM
    Lattice( 'x = 1 to 2 step 1, y = 1 to 2 step 1' )
GROUP BY
    1,
    x,
    y
  WITH ROLLUP`
];

function GetPath(row: Row) {
    let names = [];
    while (row != null) {
        names.push(row.name);
        row = row.parent;
    }
    return "/" + names.reverse().join("/");
}

function ToCsvWithPath(table: Table) {
    const newTable = new Table();
    newTable.setColumns(["Path", ...table.columnNames], [Types.String, ...table.columnTypes]);
    for (const irow of IterTools.dfs_iter(table.rows, i => i.children)) {
        const newRow = newTable.createRow(irow.name);
        newRow.setValue("Path", GetPath(irow));
        for (let i = 0; i < table.columnNames.length; i++) {
            let val = irow.getValue(i);
            if (typeof val === "number") {
                val = (+val).toFixed(2);
            }
            // i + 1 is for the path col
            newRow.setValue(i + 1, val);
        }
        newTable.appendRow(newRow);
    }
    return Papa.unparse(TableHelper.toObjectArray(newTable), {
        header: true
    });
}

@declareFunction("Fetch")
@functionArg("row")
@functionArg("url", Types.String)
class FetchFunction extends IFunction {
    public eval(
        optionLookup: { [id: string]: any; },
        context: IFunctionEvaluatorContext
    ) {
        const url = optionLookup["url"];
        console.log("fetching", url);
        return fetch(url)
            .then(r => {
                console.log("fetched", r.status);
                return r.text();
            });
    }
}

RegisterFunction("Fetch", FetchFunction);

describe("Query tests", () => {
    let context: IFunctionEvaluatorContext = {
        FindFunctionInfo: FindFunctionInfo,
        GetAllFunctions: GetAllFunctions,
        cancelToken: new CancelToken<any>(),
        evaluate: null,
        user: null,

        userContext: null,

        setGlobal: (name, val) => void 0,
        getGlobal: (name) => null,
        getGlobalKeys: () => [],

        setLocal: (name, val) => void 0,
        getLocal: (name) => null,
    };
    for (const query of queries) {
        test(query, async () => {
            await expect(RunMql(query, {}, context, context.cancelToken)
                .then(res => ToCsvWithPath(res))
            ).resolves.toMatchSnapshot(query);
        });
    }
});
