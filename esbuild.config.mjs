import esbuild from "esbuild";
import process from "process";
import { builtinModules as builtins } from "module";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { copyFileSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const prod = process.argv[2] === "production";

const PLUGIN_DIR = "test_vault/.obsidian/plugins/pseudonymizer-tool";

// En mode dev : copie styles.css dans le vault de test après chaque rebuild.
const copyStylesPlugin = {
  name: "copy-styles",
  setup(build) {
    build.onEnd(() => {
      if (existsSync("styles.css")) {
        try {
          copyFileSync("styles.css", `${PLUGIN_DIR}/styles.css`);
        } catch {
          // vault de test absent — pas bloquant
        }
      }
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  // Redirige onnxruntime-node vers onnxruntime-web :
  // @xenova/transformers fait un import statique ESM de onnxruntime-node (levé au niveau module,
  // avant tout try/catch). En le remplaçant par onnxruntime-web (backend WASM), le runtime
  // s'exécute sans dépendance aux binaires natifs, ce qui est nécessaire dans Electron.
  alias: {
    // onnxruntime-node → ort-web.node.js :
    //   @xenova/transformers fait un import statique de onnxruntime-node — on le redirige.
    // onnxruntime-web → ort-web.node.js (explicite) :
    //   évite que esbuild choisisse ort-web.min.js (browser bundle) dont la glue emscripten
    //   a un chemin WASM hardcodé vers electron.asar et appelle path.normalize avec path={}.
    //   ort-web.node.js utilise fs.readFileSync + path réel → fonctionne dans Electron.
    'onnxruntime-node': resolve(__dirname, 'node_modules/onnxruntime-web/dist/ort-web.node.js'),
    'onnxruntime-web':  resolve(__dirname, 'node_modules/onnxruntime-web/dist/ort-web.node.js'),
  },
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2020",
  // Dans un bundle CJS, import.meta.url est undefined. @xenova/transformers/src/env.js
  // en a besoin pour localiser son répertoire (RUNNING_LOCALLY). On injecte un polyfill
  // basé sur __filename (disponible dans Electron) pour éviter fileURLToPath(undefined).
  banner: {
    js: 'var __importMetaUrl=typeof __filename!=="undefined"?require("url").pathToFileURL(__filename).href:undefined;',
  },
  define: {
    'import.meta.url': '__importMetaUrl',
  },
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: prod ? "main.js" : `${PLUGIN_DIR}/main.js`,
  plugins: prod ? [] : [copyStylesPlugin],
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
