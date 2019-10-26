# `@mavenomics/coreutils`

Common utilites and helpers for all MavenWorks packages.

Some of these are general purpose helpers, like `AsyncTools` and `IterTools`.

## Type Annotations

MavenWorks includes a 'type annotation' system that feeds into the framework in
a few different places, as well as the query engine. They generally live
'alongside' data at runtime, and do not interact with TypeScript in any
meaningful way. The framework also makes no guarantees about correctness- a
malevolently bent part writer is always allowed to write any value to any option.

This is likely to change down the road, mostly for soundness reasons but also to
make the framework more useful with typed data and to improve error messages.

## Serialization

The base serializer lives in this package, and can be called using
`Converters.serialize` or `Converters.deserialize`. If you have an unknown value,
you can infer it's type using `Converters.inferType`, but beware: this function
can get very expensive.
