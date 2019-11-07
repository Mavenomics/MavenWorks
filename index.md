[//]: # (should this be combined with or re-organized with respect to the master branch README.md?)
[//]: # (should we add a TOC or nav side-bar, use summary/detail accordions or break up into more pages?)
[//]: # (should we add an admin and/or deployment/install sections?)
[//]: # (should we include myBinder links? GitHUb links/badges? screenshots?)

**MavenWorks** is a free open source dashboarding framework offering uniquely flexible and user-friendly ways to quickly build dashboards and analytical applications.

MavenWorks dashboards can be built and shared with the MavenWorks standalone app, running client-side without any server dependencies. Dashboards can also be shared via an optional MavenWorks Config Server. Alternately MavenWorks dashboards can be built in JupyterLab, use Jupyter kernels for server-side data retrieval and calculations, and be shared with JupyterLab or via a user-friendly Viewer

# Standalone Demos

 - [Hosted Standalone](./app) : the base app for building dashboards from scratch
 - [Demos listing](./app/demos/index.html) :  examples to load into the hosted standalone

# User Documentation 

 - [Dashboarding 101](./user/dashboarding-101.md)
 - [Queries and Bindings](./user/queries.md)
 - [Build a Graphing Calculator](./user/graphing-calculator.md)
 - [Getting Started in JupyterLab](./user/getting-started.md)
 
# Developer Reference

 - [API Documentation](./api) : detailed low-level documentation generated for the current npm release
 - [npm packages](https://www.npmjs.com/search?q=mavenomics) : downloads and some documentation for the underlying packages
 - [Controlled Frame demo](./app/demos/controlled-frame-demo.html) : shows how to embed Standalone MavenWorks within a larger page and control it via URL
 - [Sandboxed MQL demos](https://codesandbox.io/s/mql-demo-vr5q5?expanddevtools=1&fontsize=14&module=%2Fsrc%2Findex.js) : shows how to use MavenWorks npm packages directly with MQL queries on CodeSandbox


# Contributor Reference
 - [Building from source](./developer/build-from-source.md)
 - [Architecture Overview](./developer/high-level-overview.md)
