# Getting Started with MavenWorks for JupyterLab

## Installing

In order to use MavenWorks for JupyterLab, you must first have JupyterLab
installed. "Classic" Jupyter is not supported.

Installing is straight-forward:

```sh
$ pip install mavenworks
$ jupyter serverextension enable --py mavenworks.server
$ jupyter labextension install jupyterlab-mavenworks
```

Note! If your JupyterLab server is running, you'll need to restart it before you
can use some features of MavenWorks for JupyterLab.

## Learning

MavenWorks comes with some documentation on GitHub.io. The following tutorials
should give you a good overview of MavenWorks:

 - [Dashboarding 101](./dashboarding-101.md)
 - [Queries](./queries.md)
 - [Build an Animated Graphing Calculator](./graphing-calculator.md)

Our Binder comes with a library of demos, if you prefer looking at examples:

 - [![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/Mavenomics/MavenWorks/binder?urlpath=lab)

And if you want to look at dashboards more generally, MavenWorks Standalone
includes a few more demos that you can interact with:

 - [Demos listing](../app/demos/index.html)

MavenWorks Standalone also includes an in-app help browser that you can call up
with the <kbd>F1<kbd> key. This in-app help includes reference docs on MQL
functions and dashboard layout regions.
