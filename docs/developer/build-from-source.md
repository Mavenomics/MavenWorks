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
git clone https://github.com/Mavenomics/MavenKernel.git
cd ./MavenKernel
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

### 4. Setup Verdaccio and "publish" your local packages to it

Verdaccio is a private, self-hosted NPM registry. We need this to be able to
reliably work with our local packages in the JupyterLab build chain.

  1. Install Verdaccio:
  ```bash
  yarn global add verdaccio
  # alternatively, with NPM:
  npm install --global verdaccio
  ```
  2. Start Verdaccio in a new console:
  ```bash
  verdaccio
  ```
  3. Run the local publish script:
  ```bash
  ./bin/deploy_pkgs.sh
  ```

  > ### Windows note
  >
  > On windows, use the following powershell script instead:
  > ```ps1
  > ./bin/republish.ps1
  > ```

  > ### Why is this necessary?
  >
  > It's rather annoying setting up a private repo, but the underlying cause is
  > a rather complicated set of issues around how JupyterLab's extension bundler
  > works. For more information, see https://github.com/jupyterlab/jupyterlab/issues/6109.

### 5. Set your `.yarnrc` to point to Verdaccio

Add the following entry to your yarnrc file:
```yml
"@mavenomics:registry": "http://your-registry-location/"
```

This tells the JupyterLab builder to look via Verdaccio for unresolved packages.

### 6. Link the development versions of the packages for JupyterLab
```bash
jupyter labextension link ./packages/* --no-build
jupyter labextension unlink ./packages/metapackage --no-build
```
> If you don't do this, JupyterLab will pull the packages off the NPM registry
> and won't use your local checkout.

### 7. Build and Run JupyterLab
  ```bash
  jupyter lab build
  jupyter lab
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
