# `@mavenomics/chart-parts`

This package provides a set of pivoted chart parts, using the Perspective engine
as a back end.

### Why is this a separate package?

Perspective's backend uses WebAssembly for efficiency, which is difficult to
load in some bundling environments (such as JupyterLab). This package includes
an intermediate bundling step to package Perspective together into something
that the Jupyter extension can load directly, without complicating the build for
bundle environments that can handle it (such as the Viewer).
