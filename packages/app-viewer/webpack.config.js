const path = require("path");
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");

const config = {
    entry: "./lib/index.js",
    mode: process.env.NODE_ENV || "development",
    output: {
        path: path.resolve(__dirname, "..", "..", "mavenworks", "server", "static"),
        filename: "[name].bundle.js"
    },
    plugins: [],
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
            }
        ]
    },
    node: {
        fs: "empty"
    },
    devtool: "source-map"
};

if (process.argv.includes("--analyze")) {
    config.plugins.push(new BundleAnalyzerPlugin({ analyzerPort: "auto" }))
}

module.exports = config;
