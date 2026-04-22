import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const rootDir = process.cwd();
const modelsDir = path.join(rootDir, 'models');

function copyDirectory(sourceDir, targetDir, predicate = () => true) {
  if (!existsSync(sourceDir)) {
    return;
  }

  mkdirSync(targetDir, { recursive: true });

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath, predicate);
      continue;
    }

    if (entry.isFile() && predicate(sourcePath)) {
      copyFileSync(sourcePath, targetPath);
    }
  }
}

function serveStaticDirectory(urlPrefix, sourceDir) {
  return (req, res, next) => {
    const requestUrl = decodeURIComponent((req.url || '').split('?')[0]);

    if (!requestUrl.startsWith(urlPrefix)) {
      next();
      return;
    }

    const relativePath = requestUrl.slice(urlPrefix.length);
    const filePath = path.resolve(sourceDir, relativePath);
    const sourceRoot = path.resolve(sourceDir);
    const resolvedRelativePath = path.relative(sourceRoot, filePath);

    if (
      resolvedRelativePath.startsWith('..') ||
      path.isAbsolute(resolvedRelativePath) ||
      !existsSync(filePath)
    ) {
      next();
      return;
    }

    const fileStat = statSync(filePath);
    if (!fileStat.isFile()) {
      next();
      return;
    }

    if (filePath.endsWith('.onnx') || filePath.endsWith('.wasm')) {
      res.setHeader('Content-Type', 'application/octet-stream');
    }

    createReadStream(filePath).pipe(res);
  };
}

function staticAssetsPlugin() {
  return {
    name: 'web-voice-changer-static-assets',
    configureServer(server) {
      server.middlewares.use(serveStaticDirectory('/models/', modelsDir));
    },
    closeBundle() {
      const distDir = path.join(rootDir, 'dist');

      copyDirectory(modelsDir, path.join(distDir, 'models'));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [staticAssetsPlugin()],
});
