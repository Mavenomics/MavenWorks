set -e

APP_ARCHIVE_ROOT="/archive/sinks"
TARBALL_ARCHIVE_ROOT="/archive/tarballs"

if [ $GIT_BRANCH != "origin/master" ]; then
    # sanitize branch name
    BRANCH_NAME=`echo -n $GIT_BRANCH | tr / -`
    BRANCH_NAME=${BRANCH_NAME//[^a-zA-Z0-9_\-]}

    # move this into a branch folder
    if [ ! -d "$APP_ARCHIVE_ROOT/$BRANCH_NAME" ]; then
        mkdir $APP_ARCHIVE_ROOT/$BRANCH_NAME
        mkdir $TARBALL_ARCHIVE_ROOT/$BRANCH_NAME
    fi

    TARBALL_DIR=$TARBALL_ARCHIVE_ROOT/$BRANCH_NAME/$BUILD_ID
    APP_DIR=$APP_ARCHIVE_ROOT/$BRANCH_NAME/$BUILD_ID
else
    TARBALL_DIR=$TARBALL_ARCHIVE_ROOT/$BUILD_ID
    APP_DIR=$APP_ARCHIVE_ROOT/$BUILD_ID
fi

mkdir $TARBALL_DIR
mkdir $APP_DIR

# pack up all the client packages
yarn workspaces run pack
mv -t $TARBALL_DIR ./packages/*/*.tgz

# pack up demo parts
zip -r parts.zip ./parts
zip -r demos.zip ./demos
mv -t $TARBALL_DIR parts.zip demos.zip

# pack up the Maven wheel
python setup.py bdist_wheel
mv -t $TARBALL_DIR ./dist/*.whl

# Move the Standalone artifacts to the archive
# TODO: Kick up the demos to a shared folder?
cd ./packages/app-standalone/public
cp -r -t $APP_DIR ./
cd ..
zip -r kitchen-sink.zip ./public
mv -t $TARBALL_DIR kitchen-sink.zip


echo "Tarballs built"