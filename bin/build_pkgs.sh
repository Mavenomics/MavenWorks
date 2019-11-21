#!/bin/bash
set -e

yarn install --frozen-lockfile
echo "========== Client Plugin Packages in this build =========="
yarn list --depth=0
echo "========== End Package versions =========="

# build the Typescript sources
yarn workspace @mavenomics/metapackage run build

export NODE_ENV=production # run production builds

# build, test, and lint the packages
yarn workspaces run build:ci
yarn run lint
yarn run test --silent

# run the bundlers for top-level projects

yarn workspace @mavenomics/mql-worker run bundle:ci
yarn workspace @mavenomics/viewer run bundle:ci
yarn workspace @mavenomics/standalone run bundle:ci
