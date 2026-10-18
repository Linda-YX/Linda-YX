import { build } from "vite";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const outDir = path.join(root, "standalone");
const template = await readFile(
  path.join(root, "public/samples/holdings.csv"),
  "utf8",
);
const result = await build({
  root,
  base: "./",
  plugins: [
    {
      name: "standalone-local-assets",
      enforce: "pre",
      transform(code, moduleId) {
        if (moduleId.endsWith("/src/importers.ts")) {
          return code
            .replace("pdf.worker.min.mjs?url", "pdf.worker.min.mjs?raw")
            .replace(
              "pdfjs.GlobalWorkerOptions.workerSrc = worker;",
              'pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([worker], {type: "text/javascript"}));',
            );
        }
        if (moduleId.endsWith("/src/Reports.tsx")) {
          return code.replace(
            "href={`${import.meta.env.BASE_URL}samples/holdings.csv`}",
            `href=${JSON.stringify("data:text/csv;charset=utf-8," + encodeURIComponent(template))}`,
          );
        }
      },
    },
  ],
  build: {
    write: false,
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
    chunkSizeWarningLimit: 3000,
  },
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap(
  (r) => r.output,
);
const entry = outputs.find((o) => o.type === "chunk" && o.isEntry);
if (!entry || entry.imports.length || entry.dynamicImports.length)
  throw new Error("Standalone bundle still depends on imports.");
const styles = outputs
  .filter((o) => o.type === "asset" && o.fileName.endsWith(".css"))
  .map((o) => String(o.source))
  .join("\n");
const original = await readFile(path.join(root, "index.html"), "utf8");
const html = original
  .replace(/<script\s+type="module"\s+src="\/src\/main\.tsx"><\/script>/, "")
  .replace(
    "</head>",
    () => `<style>${styles.replaceAll("</style", "<\\/style")}</style></head>`,
  )
  .replace(
    "</body>",
    () =>
      `<script type="module">${entry.code.replaceAll("</script", "<\\/script")}</script></body>`,
  );
if (html.includes('src="/src/main.tsx"'))
  throw new Error("Unreplaced development entry.");
await mkdir(outDir, { recursive: true });
const output = path.join(outDir, "finances-preview.html");
await writeFile(output, html);
console.log(
  `Standalone preview written: ${output} (${Buffer.byteLength(html)} bytes)`,
);
