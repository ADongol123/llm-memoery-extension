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
    // Allow .js imports to resolve to .ts files (TypeScript ESM import style)
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
        { from: "src/popup/popup.html",  to: "popup.html" },
        { from: "src/popup/popup.css",   to: "popup.css" },
      ],
    }),

    // Inject Supabase config at build time — anon key is safe for client-side use (protected by RLS)
    new webpack.DefinePlugin({
      __SUPABASE_URL__:      JSON.stringify(process.env.SUPABASE_URL      ?? ""),
      __SUPABASE_ANON_KEY__: JSON.stringify(process.env.SUPABASE_ANON_KEY ?? ""),
      __SELECTORS_URL__:     JSON.stringify(process.env.SELECTORS_URL     ?? ""),
    }),
  ],

  // Avoid bundling duplicates across chunks
  optimization: {
    splitChunks: false,
  },
});
