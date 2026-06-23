const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

module.exports = (env, argv) => ({
  mode: argv.mode ?? "production",
  devtool: argv.mode === "development" ? "inline-source-map" : false,

  entry: {
    background: "./src/background/index.ts",
    content:    "./src/content/index.ts",
    popup:      "./src/popup/index.ts",
  },

  output: {
    path:     path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean:    true,
  },

  resolve: {
    extensions: [".ts", ".js"],
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
    alias: {
      "@llm-memory/shared": require("path").resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        use:  "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },

  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "public/manifest.json",  to: "manifest.json" },
        { from: "public/icon16.png",     to: "icon16.png" },
        { from: "public/icon48.png",     to: "icon48.png" },
        { from: "public/icon128.png",    to: "icon128.png" },
        { from: "src/popup/popup.html",  to: "popup.html" },
        { from: "src/popup/popup.css",   to: "popup.css" },
      ],
    }),

    new webpack.DefinePlugin({
      __FIREBASE_API_KEY__:              JSON.stringify(process.env.FIREBASE_API_KEY ?? ""),
      __FIREBASE_AUTH_DOMAIN__:          JSON.stringify(process.env.FIREBASE_AUTH_DOMAIN ?? ""),
      __FIREBASE_PROJECT_ID__:           JSON.stringify(process.env.FIREBASE_PROJECT_ID ?? ""),
      __FIREBASE_STORAGE_BUCKET__:       JSON.stringify(process.env.FIREBASE_STORAGE_BUCKET ?? ""),
      __FIREBASE_MESSAGING_SENDER_ID__:  JSON.stringify(process.env.FIREBASE_MESSAGING_SENDER_ID ?? ""),
      __FIREBASE_APP_ID__:               JSON.stringify(process.env.FIREBASE_APP_ID ?? ""),
      __GOOGLE_CLIENT_ID__:              JSON.stringify(process.env.GOOGLE_CLIENT_ID ?? ""),
      __GEMINI_API_KEY__:                JSON.stringify(process.env.GEMINI_API_KEY ?? ""),
    }),
  ],

  optimization: {
    splitChunks: false,
  },
});
