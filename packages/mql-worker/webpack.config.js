const path = require("path");
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");

const { DefinePlugin } = require("webpack");

const config = {
  entry: './lib/worker',
  mode: process.env.NODE_ENV || "development",
  output: {
    filename: 'mql.worker.js',
    path: path.resolve(__dirname)
  },
  target: "webworker",
  node: {
    module: "empty",
    net: "empty",
    fs: "empty"
  },
  plugins: [
    new DefinePlugin({
      // We need to have DefinePlugin replace these, since they won't get
      // plumbed in directly. Doing it this way keeps us from tying in too
      // deeply with how webpack supplies external information to builds.
      // They have to be serialized because Webpack is actually doing a
      // textual find-replace. cf. https://webpack.js.org/plugins/define-plugin/
        'process.env.BUILD_NUMBER': JSON.stringify(process.env.BUILD_NUMBER || "develop"),
        'process.env.GIT_BRANCH': JSON.stringify(process.env.GIT_BRANCH || "develop"),
        'process.env.GIT_COMMIT': JSON.stringify(process.env.GIT_COMMIT || "develop"),
        'process.env.BUILD_DATE': JSON.stringify(Date.now())
    })
  ],
  devtool: process.env.NODE_ENV !== "production" ? void 0 : "eval-source-map"
};

if (process.argv.includes("--analyze")) {
  config.plugins.push(new BundleAnalyzerPlugin({ analyzerPort: "auto" }))
}

module.exports = config;