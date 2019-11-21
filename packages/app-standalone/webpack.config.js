const path = require("path");
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
const { DefinePlugin } = require("webpack");

const outDir = path.resolve(__dirname,
    process.argv.includes("--docs") ? "../../docs/app" : "public",
);

const config = {
    entry: "./lib/index.js",
    mode: process.env.NODE_ENV || "development",
    output: {
        path: outDir,
        filename: "[name].bundle.js"
    },
    resolveLoader: {
        modules: ['node_modules', path.resolve(__dirname, "../../bin/")]
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                use: [
                    { loader: "style-loader" },
                    { loader: "css-loader" }
                ]
            },
            { test: /\.(jpg|png|gif)$/, use: 'file-loader' },
            {
                test: /\.woff2?(\?v=\d+\.\d+\.\d+)?$/,
                use: 'url-loader?limit=10000&mimetype=application/font-woff'
            },
            {
                test: /\.(ttf|otf)(\?v=\d+\.\d+\.\d+)?$/,
                use: 'url-loader?limit=10000&mimetype=application/octet-stream'
            },
            { test: /\.eot(\?v=\d+\.\d+\.\d+)?$/, use: 'file-loader' },
            {
                test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
                use: 'url-loader?limit=10000&mimetype=image/svg+xml'
            },
            { test: /(?<!template)\.md$/, use: 'md-inlineinator' }
        ]
    },
    node: {
        fs: "empty"
    },
    plugins: [
        new DefinePlugin({
            // We need to have DefinePlugin replace these, since they won't get
            // plumbed in directly. Doing it this way keeps us from tying in too
            // deeply with how webpack supplies external information to builds.
            // They have to be serialized because Webpack is actually doing a
            // textual find-replace. cf. https://webpack.js.org/plugins/define-plugin/
            'process.env.BUILD_NUMBER': JSON.stringify(process.env.BUILD_NUMBER),
            'process.env.GIT_BRANCH': JSON.stringify(process.env.GIT_BRANCH),
            'process.env.GIT_COMMIT': JSON.stringify(process.env.GIT_COMMIT),
            'process.env.BUILD_DATE': JSON.stringify(Date.now()),
            'process.env.USE_GPL': JSON.stringify(process.env.USE_GPL || "true"),
        })
    ]
};

if (process.argv.includes("--analyze")) {
    config.plugins.push(new BundleAnalyzerPlugin({ analyzerPort: "auto" }))
}

module.exports = config;