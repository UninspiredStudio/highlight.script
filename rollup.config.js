import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";
import scss from "rollup-plugin-scss";

export default {
  input: "src/index.ts",
  output: [
    {
      format: "esm",
      file: "dist/index.mjs",
    },
    {
      format: "cjs",
      file: "dist/index.cjs",
    },
    {
      format: "umd",
      name: "Highlights",
      plugins: [terser()],
      file: "dist/highlight.min.js",
    },
  ],
  plugins: [
    typescript(),
    scss({ fileName: "highlights.css", outputStyle: "compressed" }),
  ],
};
