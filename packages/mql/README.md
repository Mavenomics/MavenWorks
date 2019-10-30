# `@mavenomics/mql`

The MQL Query Engine

Play with examples on CodeSandbox:

[![Edit MQL demos](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/s/mql-demo-vr5q5?expanddevtools=1&fontsize=14&module=%2Fsrc%2Findex.js)

MQL is a hackable, hierarchal dialect of SQL. It is designed to be flexible, and
intentionally isn't a very 'conformant' SQL dialect. For instance, MQL lacks
JOIN primitives, instead opting for functions:

```mql
SELECT
  x,
  y,
  z
FROM
    FullOuterNaturalJoin(
        'x',
        Lattice( 'x = 1 to 3 step 1, z = 1 to 2 step 1' ),
        Lattice( 'x = 1 to 3 step 1, y = 1 to 2 step 1' )
    )
```

This may seem strange to someone with a strong SQL background, but this is part
of what lets the engine be so much more expressive. Without a JOIN primitive,
it's much clearer to non-SQL-experts what the JOIN is doing and how they can
modify it to do what they want.

You can read the MQL documentation in detail [here](https://mavenomics.github.io/MavenWorks/user/queries.html#mql-queries),
and look through the UDF documentation using in-app help by pressing the F1 key.

## Using MQL in your app

There's a few different ways you can use MQL. The simplest is in the main UI
thread, using this package:

```ts
import { RunMql } from "@mavenomics/mql";
import { CancelToken } from "@mavenomics/coreutils";

const token = new CancelToken();

RunMql("SELECT x + y FROM Lattice('x = 1 to 10 step 1, y = 1 to 10 step 1",
    {},
    {},
    token
).then(res => console.log("result", res))
 .catch(res => console.log("error", res));
```

MQL also provides a handy template function to let you interleave MQL and
Javascript in a handy way:

```ts
import { mql } from "@mavenomics/mql";
import { TableHelper, Row } from "@mavenomics/table";

const tbl = await mql`SELECT
    x,
    y,
    ${(row) => row.getValue("x") + row.getValue("y")} as [x + y]
FROM
    Lattice('x = 1 to 10 step 1, y = 1 to 10 step 1')`;
console.log("Table 1", tbl);

// You can use JS expressions anywhere, even in FROM clauses!
const tbl2 = await mql`SELECT
    x
FROM
    ${TableHelper.fromObjectArray([{x: 1}, {x: 2}, {x: 3}])}`;
console.log("Table 2", tbl2);

// And you can pass arguments from within MQL:
function GetSign(_row: Row, value: number) {
    return Math.sign(value);
}

const tbl3 = await mql`SELECT
    x,
    ${GetSign}(x)
FROM Lattice('x = -5 to 5 step 1')`;
console.log("Table 3", tbl3);
```

### Advanced MQL

#### Row Traversal

MQL internally has a 'tree' that it uses to group rows together. If you're
writing a function like 'Sum', you'll need some knowledge about this tree in
order to calculate the sum of the leaves. Let's look at a simple example:

```ts
import { IterTools } from "@mavenomics/coreutils";

function MySum(row: Row) {
    // In this function we're going to hardcode a particular column. Read below
    // if you'd like to evaluate an MQL expression instead.
    const COL_TO_SUM = "x";
    let sum = row.getValue(COL_TO_SUM);

    // IterTools.dfs_iter is a helper to let us iterate through the rows of a
    // tree, depth-first. We give it a container and a lambda to retrieve an
    // element's children, if any.
    for (const irow of IterTools.dfs_iter(row.children, i => i.children)) {
        // You can also structure this recursively, if you like. However,
        // recursive calls incur a large performance penalty on most JS engines
        // (Safari excepted) that can make your query prohibitively expensive to
        // run.
        sum += irow.getValue(COL_TO_SUM);
    }

    // Return the value, and you're done!
    return sum;
}

const tbl4 = await mql`SELECT
    x,
    y,
    ${MySum}()
FROM
    Lattice('x = 1 to 10 step 1, y = 1 to 10 step 1')
GROUP BY
    y
  WITH ROLLUP`;
```

#### MQL Expressions

As we saw above, we had to hard-code the column to fetch into the function call.
Why is that?

In MQL, functions are evaluated for each row in the result table. This also
means that their _arguments_ are evaluated only on the current row. So if you
added an argument `x` to the `MySum` function above, it would only ever take on
a single value (that of the row we started from!). This obviously isn't useful,
so MQL includes a facility to handle this called _function expressions_, or
_fexprs_.

Normally, when a function is run, the computer has already _evaluated_ the
arguments of the function and passed them along. However, with _fexprs_, the
function is instead handed an _unevaluated expression_. With this, you can
rebind the expression to something else to get the result you want.

##### Simple Example

```ts
import {
    // First we have to annotate our functions to let MQL know that we're doing
    // something that will void the warranty
    fexpr,
    // Then we import some helpers for working with unevaluated expressions
    MqlCallback,
    CallbackHelpers
} from "@mavenomics/mql";

function MyCustomFexpr(
    row: Row,
    expr: (row: Row, done: MqlCallback) => void
) {
    return CallbackHelpers.AsAsync(expr.bind(row));
}

const tbl5 = await mql`SELECT
    x + y,
    ${fexpr(MyCustomFexpr)}(x + y)
FROM
    Lattice('x = 1 to 10 step 1, y = 1 to 10 step 1')
GROUP BY
    x,
    y
  WITH ROLLUP`;
console.log("Table 5", tbl5);
```

What have we done? In this example, we're not doing anything special. We're
evaluating the argument with the current row (which the engine normally does
for us if we're not using fexprs), and then returning that value.

Change the `expr.bind(row)` to `expr.bind(row.parent)` above and see what
happens. If you've done it right, you're now evaluating that expression _on the
parent row_!

> ###### _The Cambridge Connection_
>
> Eagle-eyed Lisp programmers of yore may point out that MQL _fexprs_ aren't
> really "true" fexprs. This is because MQL doesn't have a first-class way to
> express an unevaluated expression tree- we need to fall back on Javascript for
> that.
>
> However, calling them _fexprs_ is still useful because it's largely the same
> paradigm in practice- a function is being handed something it must first
> evaluate before it can use.

##### Creating your own SUM

Now, let's combine this with the MySum function we wrote above. Recall that we
had to iterate through the rows of the given row like this:

```ts
for (const irow of IterTools.dfs_iter(row.children, i => i.children)) {
    sum += irow.getValue(COL_TO_SUM);
}
```

We had to hardcode that getValue, since otherwise we wouldn't get the right
result. But now we know enough to turn this into a fexpr, and sum on
_expressions_ instead of merely columns! Let's try it:

```ts
async function SumCustom(row: Row, expr: (row: Row, done: MqlCallback) => void) {
    let sum = 0;
    for (const irow of IterTools.dfs_iter(row.children, i => i.children)) {
        const value = await CallbackHelpers.ToAsync(expr.bind(irow));
        sum += value;
    }
    return sum;
}

const tbl6 = await mql`SELECT
    x + y,
    sum(x + y),
    ${fexpr(SumCustom)}(x + y)
FROM
    Lattice('x = 1 to 10 step 1, y = 1 to 10 step 1')
GROUP BY
    x,
    y
  WITH ROLLUP`;
console.log("Table 6", tbl6);
```

Ta-da! You now have a SUM function that works on any expression!

> ###### An aside on performance
>
> You'll notice that the performance of this function is absolutely atrocious.
> Curious readers poking through the query engine might notice that we don't
> structure built-in MQL functions like we did above, and there's a good reason
> for that: Promises are not fast, and most browsers do not handle callbacks
> well.
>
> If this is a concern for you, you can instead do something like this:
>
> ```ts
> const deferred = [];
> for (const irow of IterTools.dfs_iter(row.children, i => i.children)) {
>     deferred.push(expr.bind(irow));
> }
>
> return Callbacks.AsAsync(
>     Callbacks.All(deferred),
> ).then(res => res.reduce((acc, i) => acc + i, 0));
> ```
>
> This is even less readable but generally much more performant. There's a few
> more optimizations you could make to this (such as removing the `reduce` call),
> but those come at the cost of agility and maintainability.

### Running MQL off the main thread

The [`@mavenomics/mql-worker`](../mql-worker) package exposes an MQL worker and
an RPC-ish wrapper around it, enabling you to offload queries to another thread.
You will need webpack to load the mql-worker module.

```ts
import { WorkerWrapper } from "@mavenomics/mql-worker";

const worker = new WorkerWrapper();

worker.OnMessage.subscribe(msg => console.log("worker msg:", msg));

worker.postMessage({
    type: "runQuery",
    queryText: "SELECT null FROM dual"
});
```

## That being said...

This particular engine is still in-progress, and has a few rough edges. Notably,
query performance leaves a lot to be desired and the lack of reliable types can
often bite UDF writers if they aren't careful. Feel free to reach out to us in
any way you think is appropriate if you run into issues- we'd be happy to help.

## Building

Building this from source is a bit more complicated than usual, owing to the
ANTLR4 grammar. You will need a JRE installed and on your $PATH in order to build
successfully.
