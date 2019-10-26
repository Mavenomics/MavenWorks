# MavenWorks

![MavenWorks screenshot depicting the Volatility3D demo notebook, in /demos/Volatility3d.ipynb](./screenshot.png)
_<sup>Bond Portfolio demo on MavenWorks Viewer 0.1.0-alpha</sup>_

Try out [MavenWorks Standalone!](https://mavenomics.github.io/MavenWorks/app)

*MavenWorks* is an open-source dashboarding framework, for Jupyter and
beyond! MavenWorks includes a JupyterLab plugin, a read-only dashboard viewer
(pictured above), and a standalone app (codenamed "Kitchen Sink").

Dashboards are flexible- you can use the same old charting libraries and
interactive widgets that you've used elsewhere. Anything that can be displayed
in a Jupyter output, can also be put into a Dashboard.

MavenWorks also supplies a data binding framework and a query engine. You can mix
SQL, Javascript, and Python right from within your dashboard!

For easier interactivity, MavenWorks also provides Parts. Parts are reusable
components of a dashboard that can be written in Python or Javascript, and allow
you to "bind" your visualizations to data. MavenWorks will take care of keeping your
visualizations in sync with the data, meaning you won't need to worry about
plumbing.

MavenWorks is under heavy development, and much of the internal APIs are unstable.

## Getting Started

The Standalone app comes with a few demos to help you understand what MavenWorks
can do. Use the [Demos index](https://mavenomics.github.io/MavenWorks/app/demos/index.html)
to navigate between them.

Jupyter deployments come with a host of demos and built-in Parts that
demonstrate parts of the API. Use the [Start Here](./demos/StartHere.ipynb)
notebook to access these demos.

You can read our documentation [here](https://mavenomics.github.io/MavenWorks/docs/index.md). We have tutorials,
reference docs, and contributor documentation. These are accessible in-app using
the <kbd>F1</kbd> key.
