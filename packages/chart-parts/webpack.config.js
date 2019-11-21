const path = require("path");
const PerspectivePlugin = require("@finos/perspective-webpack-plugin");
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
const { ProvidePlugin, DefinePlugin } = require("webpack");

const isProd = process.env.NODE_ENV != null &&
               process.env.NODE_ENV.toLowerCase() === "production";

const config = {
    entry: "./lib/index",
    mode: isProd ? "production" : "development",
    output: {
        filename: "chartpart.bundle.js",
        path: path.join(__dirname, "build"),
        libraryTarget: "umd"
    },
    module: {
        rules: [
            {
                test: /\.wasm$/,
                type: 'javascript/auto',
                loaders: ['arraybuffer-loader'],
            },
            {
                test: /\.worker.js$/,
                use: {
                    loader: "worker-loader",
                    options: { inline: true }
                }
            }
        ],
    },
    externals: /^((\@(mavenomics|jupyterlab|phosphor))|react)/,
    plugins: [
        new PerspectivePlugin(),
        new ProvidePlugin({
            $: 'jquery',
            jQuery: 'jquery'
        }),
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
    node: {
        path: "empty",
        fs: "empty"
    },
    devtool: isProd ? void 0 : "eval-source-map"
}

if (process.argv.includes("--analyze")) {
    config.plugins.push(new BundleAnalyzerPlugin({ analyzerPort: "auto" }))
}

module.exports = config;