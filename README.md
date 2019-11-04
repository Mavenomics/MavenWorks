# MavenWorks

![MavenWorks screenshot depicting the Volatility3D demo notebook, in /demos/Volatility3d.ipynb](./screenshot.png)
_<sup>Bond Portfolio demo on MavenWorks Viewer 0.1.0-alpha</sup>_

Try the hosted standalone version: [MavenWorks Standalone!](https://mavenomics.github.io/MavenWorks/app)

Or the JupyterLab version on Binder! [![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/Mavenomics/MavenWorks/binder?urlpath=lab)

*MavenWorks* is an open-source dashboarding framework, for Jupyter and
beyond! MavenWorks includes an easy to host or embed standalone app for WYSIWIG dsahboard construction and use, optional shared configuration, integrations with JupyterLab, and a read-only Jupyter dashboard viewer (pictured above).

MavenWorks dashboards are uniquely flexible and uniquely accessible to non-developers. 

Highly interactive dashboards can be built from the included extensible and 
scriptable gallery of visual Parts, and the Jupyter version can optionally use any 
charting libraries or interactive widgets available in JupyterLab. Almost anything that can be displayed
in a web page or Jupyter notebook can also be put into a Dashboard!

MavenWorks supplies a Data Binding framework and a query engine for fetching data and adding analytics, which can mix Javascript, a powerful SQL dialect and (if using Jupyter) Python right from within your dashboard!

MavenWorks provides user-friendly low-code or no-code vissual tools for putting together Parts and Bindings into full dashboard layouts. MavenWorks will take care of the complicated plumbing that keeps displays, data and analytics all in sync.

## Getting Started
You can read our documentation [here](https://mavenomics.github.io/MavenWorks) on GitHub pages, where We have tutorials,
reference docs, and contributor documentation. Most of the documentation is also accessible in-app using
the <kbd>F1</kbd> Help key.

GitHub also hosts a [standalone app](https://mavenomics.github.io/MavenWorks/app/) where you can start building dashboard application from scratch following the tutorials, or  can navigate between pre-built [examples demos](https://mavenomics.github.io/MavenWorks/app/demos/index.html)  to help you understand what MavenWorks
can do.

MavenWorks is under heavy development so if you have questions or see something you don't like file an issue right here on GitHub or contact support@mavenomics.com .

## Getting Started in JupyterLab

You can try out a hosted JupyterLab experience live on on Binder! [![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/Mavenomics/MavenWorks/binder?urlpath=lab)

To install the JupyterLab extension in an existing environemnt, run these commands:

```sh
$ pip install mavenworks
$ jupyter serverextension enable --py mavenworks.server
$ jupyter labextension install jupyterlab-mavenworks
```

Jupyter deployments come with several demos and scripted Parts that
demonstrate parts of the API. Use the [Start Here](./demos/StartHere.ipynb)
notebook to access these demos, and refer to our [Getting Started](https://mavenomics.github.io/MavenWorks/docs/user/getting-started.md)
guide or contact support@mavenomics.com for additional help.


