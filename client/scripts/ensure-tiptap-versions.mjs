import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const PINNED = {
  '@tiptap/core': '3.24.0',
  '@tiptap/pm': '3.24.0',
  '@tiptap/extension-list': '3.24.0',
};

for (const [name, expected] of Object.entries(PINNED)) {
  let installed = null;
  try {
    installed = require(`${name}/package.json`).version;
  } catch {
    // not installed yet
  }

  if (installed !== expected) {
    console.log(`[tiptap] fixing ${name}: ${installed ?? 'missing'} -> ${expected}`);
    execSync(`npm install ${name}@${expected} --save-exact --legacy-peer-deps --no-audit --no-fund`, {
      stdio: 'inherit',
    });
  }
}

console.log('[tiptap] verified pinned versions');
