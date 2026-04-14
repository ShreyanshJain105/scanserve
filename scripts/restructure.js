const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const apiDir = path.join(rootDir, 'apps', 'api');
const webDir = path.join(rootDir, 'apps', 'web');
const sharedDir = path.join(rootDir, 'packages', 'shared');
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');

// Helper to recursively copy directories
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Helper to rename/move directory
function moveDirSync(src, dest) {
  if (fs.existsSync(src)) {
    fs.renameSync(src, dest);
    console.log(`Moved ${src} to ${dest}`);
  }
}

console.log("Starting restructure process...");

// 1. Move apps to root
moveDirSync(apiDir, backendDir);
moveDirSync(webDir, frontendDir);

// 2. Copy shared to backend and frontend
console.log("Copying shared files...");
const sharedSrc = path.join(sharedDir, 'src');
const backendSharedDest = path.join(backendDir, 'src', 'shared');
const frontendSharedDest = path.join(frontendDir, 'src', 'shared');

copyDirSync(sharedSrc, backendSharedDest);
copyDirSync(sharedSrc, frontendSharedDest);

// 3. Delete apps and packages if empty
try {
  fs.rmSync(path.join(rootDir, 'apps'), { recursive: true, force: true });
  fs.rmSync(path.join(rootDir, 'packages'), { recursive: true, force: true });
  fs.rmSync(path.join(rootDir, 'pnpm-workspace.yaml'), { force: true });
  console.log("Deleted old monorepo folders.");
} catch (e) {
  console.error("Error deleting old folders:", e.message);
}

// 4. Regex replacements for @scan2serve/shared -> ../shared
function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
    if (entry.isDirectory()) {
      walkDir(fullPath, callback);
    } else if (entry.isFile() && (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx'))) {
      callback(fullPath);
    }
  }
}

console.log("Replacing imports in backend...");
walkDir(backendDir, (filePath) => {
  let content = fs.readFileSync(filePath, 'utf-8');
  let newContent = content;
  // Determine relative path from this file to backend/src/shared
  const fileDir = path.dirname(filePath);
  let relPath = path.relative(fileDir, backendSharedDest);
  relPath = relPath.replace(/\\/g, '/');
  if (!relPath.startsWith('.')) relPath = './' + relPath;

  newContent = newContent.replace(/@scan2serve\/shared/g, relPath);
  
  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent);
    console.log(`Updated imports in ${filePath}`);
  }
});

console.log("Replacing imports in frontend...");
walkDir(frontendDir, (filePath) => {
  let content = fs.readFileSync(filePath, 'utf-8');
  let newContent = content;

  // Frontend uses tsconfig paths with @/ ... we can actually just replace it with '@/shared' 
  // Let's check frontend/tsconfig.json ... By default Next.js has @/* mapped to ./src/*
  newContent = newContent.replace(/@scan2serve\/shared/g, '@/shared');
  
  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent);
    console.log(`Updated imports in ${filePath}`);
  }
});

console.log("Done.");
