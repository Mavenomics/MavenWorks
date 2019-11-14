---
title: Build Notes
---

# Contributing to MavenWorks

<!-- Notes here about repo policy- don't be evil, issue labeling/etc., links
    to pre-baked good-first-issue searches, etc. -->

# Building from Source

## Targets

MavenWorks consists of 4 targets, having the following codenames:

- Standalone
- Config Server
- Viewer
- JupyterLab Extension

The "Standalone" app is a fully independent app that uses the full dashboarding
framework, and provides additional UI and editor skinning.

The "Config Server" builds off the Standalone, adding a centralized server for
saving and loading dashboards.

The "Viewer" is a Jupyter extension that adds an interactive, read-only
Jupyter notebook viewer. Notebooks must contain at least 1 MavenWorks Dashboard,
which will then be displayed as the notebook output. Viewer instances are given
a live Jupyter kernel to work off, just as in JupyterLab.

The JupyterLab Extension adds a Dashboard cell output _and_ an independent
"Dashboard document." The extension also adds Jupyter-specific tooling and
integration, such as an additional option binding evaluator for Python.

## Setup for the "Standalone MavenWorks" and "ConfigServer" targets

### 1. Clone the repository
```bash
git clone https://github.com/Mavenomics/MavenWorks.git
cd ./MavenWorks
```

### 2. Install Dependencies
```bash
yarn
```

> **Note:** This project uses
> [Yarn Workspaces](https://yarnpkg.com/lang/en/docs/workspaces/). Consequently,
> NPM is not supported.

### 3. Build the packages
```bash
yarn build
yarn bundle  # Bundles the Viewer, Mql Worker, and Standalone App
```

### 4. Run Standalone MavenWorks
```bash
yarn serve
```

## Setup for "JupyterLab Extension" and "Viewer" targets

The JupyterLab extension is, by necessity, a bit more complex to setup. You'll
need to setup both the Python extension and the development bundles:

### 1. Install Python dependencies
- MavenWorks requires Python >= 3.6 and will not run on 2.x.
- MavenWorks has not yet been tested with 3.8.
- If you use conda, you can use the `environment.yml` file to setup an
environment named `maven-kernel` on your machine.
```bash
conda env create -f ./environment.yml
```

### 2. Install the Python package in dev mode
```bash
pip install -e .
```

### 3. Enable the Jupyter server extensions
```bash
jupyter serverextension enable --py "mavenworks.server"
```

### 4. Setup the client build chain

First, open a new terminal, `cd` to your checkout directory, and run the
following command:

```sh
$ yarn registry
```

This will start a private package registry named Verdaccio. Leave this terminal
open in the background, and switch back to the terminal you were working in.
This 'registry' always runs on `http://localhost:4873`, unless you configure it
otherwise. You can open this URL in your browser, if you like.

Now, login to this private registry via npm:

```sh
$ npm login --registry "http://localhost:4873"
```

NPM will prompt you for a username and password. These really don't matter, so
set them to anything you like.

Then, we need to 'publish' our packages to Verdaccio:

```sh
$ ./bin/deploy_pkgs.sh
```

> ### Windows note
>
> On Windows, use the following powershell script instead:
>
> ```ps1
> > ./bin/republish.ps1
> ```

Finally, tell Yarn to redirect "@mavenomics" to this private repo:

```sh
$ yarn config set "@mavenomics:registry" "http://localhost:4873"
```

You will only need to do these steps once, though sometimes you may wish to re-run
the "publish" script.

### 5. Link the development versions of the packages for JupyterLab
```sh
$ jupyter labextension link ./packages/* --no-build
$ jupyter labextension unlink ./packages/metapackage --no-build
$ jupyter labextension unlink ./packages/app-standalone --no-build
$ jupyter labextension unlink ./packages/app-viewer --no-build
$ jupyter labextension unlink ./packages/config-server --no-build
```
> If you don't do this, JupyterLab will pull the packages off the NPM registry
> and won't use your local checkout.

### 6. Build and Run JupyterLab

```sh
$ jupyter lab build
$ jupyter lab
```
> #### File Watchers
>
> To compile from MavenWorks source as it changes, use `jupyter lab --watch` after
> installing the extension. Jupyter will start a webpack watcher and launch
> the Lab interface.

> #### Windows note
>
> The file watcher described above is slow and unreliable on Windows. We
> recommend using the Standalone MavenWorks to iterate on your changes, as
> that will be faster and less prone to crashes.
