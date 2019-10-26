# `@mavenomics/mql`

The MQL Query Engine

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

## That being said...

This particular engine is still in-progress, and has a few rough edges. Notably,
query performance leaves a lot to be desired and the lack of reliable types can
often bite UDF writers if they aren't careful. Feel free to reach out to us in
any way you think is appropriate if you run into issues- we'd be happy to help.

## Building

Building this from source is a bit more complicated than usual, owing to the
ANTLR4 grammar. You will need a JRE installed and on your $PATH in order to build
successfully.
