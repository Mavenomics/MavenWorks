#!/bin/bash
set -e

if [ $GIT_BRANCH != "origin/master" ]; then
  # don't deploy except on master
  exit 0
fi

# publish the packages
# The .npmrc file on CI should be valid (ie, somebody ran `npm login`)
# TODO: Can we make this cleaner?
local_registry="http://localhost:4873"

work=$(pwd)

for PKG in ./packages/*
do
  if [ $PKG = "./packages/metapackage" ]
  then
    continue
  fi
  echo "Publishing $PKG@$version to $local_registry"
  # force publish to avoid version conflicts
  # this is safe since it's a local registry where we can do what we want
  # Note that we used to try and create a prerelease, but that actually doesn't
  # work for what we want it to do. The prereleases are ranked lower than the
  # final, and you can't target a prerelease without targetting it specifically.
  npm publish $PKG --registry=$local_registry --force
done
