/** Dependency-free preflight for the bilingual UI. Run: node scripts/check-language.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const en = JSON.parse(read('frontend/src/i18n/en.json'));
const es = JSON.parse(read('frontend/src/i18n/es-extra.json'));
const frontend = read('frontend/src/i18n/index.tsx');
const backend = read('src/auth/auth.service.ts');

assert.match(read('frontend/index.html'), /<html lang="en">/);
assert.match(frontend, /: 'en'/, 'English must be the default locale');
assert.match(read('src/database/schemas/user.schema.ts'), /preferredLanguage/);
assert.match(backend, /preferredLanguage: input\.preferredLanguage \?\? 'en'/);
assert.match(read('src/auth/auth.controller.ts'), /@Patch\('preferences\/language'\)/);
for (const component of ['AuthShell', 'AppLayout']) {
  assert.match(read(`frontend/src/components/${component}.tsx`), /<LanguageSelector/, `${component} needs selector`);
}
assert.match(read('frontend/src/admin/AdminLayout.tsx'), /admin-mobile-language/);
for (const key of ['Contraseña', 'Ciclos y operaciones', 'Cómo funciona AERVON', 'Interés compuesto', 'Retiro mínimo: 10 USDT. El sistema procesa automáticamente cuando la wallet operativa dispone de USDT y BNB suficiente para el gas.']) {
  assert.ok(en[key], `English translation missing: ${key}`);
}
assert.equal(es['Invalid credentials'], 'Teléfono o contraseña incorrectos.');
assert.ok(Object.keys(en).length > 250);
console.log(`PASS: bilingual preflight (English keys=${Object.keys(en).length}, Spanish backend/status keys=${Object.keys(es).length})`);
