#!/usr/bin/env node
/**
 * Comprobaciones estáticas del repositorio. No arranca DSH ni Electron y no
 * necesita red: apto para CI y para el bucle local.
 *
 *   node scripts/check.mjs
 */
import { readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0

function ok(message) {
  console.log(`  ok  ${message}`)
}

function fail(message, detail) {
  failures += 1
  console.error(`  fail ${message}`)
  if (detail) console.error(String(detail).trimEnd())
}

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' })
  if (result.error) {
    fail(label, result.error.message)
  } else if (result.status !== 0) {
    fail(label, result.stderr || result.stdout)
  } else {
    ok(label)
  }
}

function file(relative) {
  return path.join(root, relative)
}

console.log('DeepSeek Harness desktop — comprobaciones')

run(process.execPath, ['scripts/build.mjs', '--check'], 'el lanzador generado está actualizado')
run('bash', ['-n', 'dsh-desktop'], 'dsh-desktop tiene sintaxis bash válida')
run('bash', ['-n', 'tests/smoke.sh'], 'tests/smoke.sh tiene sintaxis bash válida')
run(process.execPath, ['--check', 'src/electron/main.js'], 'src/electron/main.js tiene sintaxis válida')
run(process.execPath, ['--check', 'scripts/build.mjs'], 'scripts/build.mjs tiene sintaxis válida')
run(process.execPath, ['--check', 'scripts/check.mjs'], 'scripts/check.mjs tiene sintaxis válida')

for (const relative of ['package.json', 'src/electron/package.json']) {
  try {
    JSON.parse(readFileSync(file(relative), 'utf8'))
    ok(`${relative} es JSON válido`)
  } catch (error) {
    fail(`${relative} es JSON válido`, error.message)
  }
}

const generated = readFileSync(file('dsh-desktop'), 'utf8')
if (/@@[A-Z0-9_]+@@/.test(generated)) {
  fail('dsh-desktop no contiene marcadores sin reemplazar')
} else {
  ok('dsh-desktop no contiene marcadores sin reemplazar')
}

if ((statSync(file('dsh-desktop')).mode & 0o111) === 0) {
  fail('dsh-desktop es ejecutable')
} else {
  ok('dsh-desktop es ejecutable')
}

const icon = readFileSync(file('assets/icon-192.png'))
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
if (!icon.subarray(0, pngSignature.length).equals(pngSignature)) {
  fail('assets/icon-192.png es un PNG')
} else {
  ok('assets/icon-192.png es un PNG')
}

if (failures > 0) {
  console.error(`\n${failures} comprobación(es) fallida(s).`)
  process.exit(1)
}
console.log('\nTodo correcto.')
