#!/usr/bin/env node
/**
 * Genera el lanzador de un solo archivo `dsh-desktop` a partir de las fuentes
 * de `src/` y el icono de `assets/`.
 *
 * El lanzador distribuye la carcasa Electron dentro de heredocs y el icono en
 * base64 para que el usuario solo necesite ese archivo. Este script es la
 * única forma recomendada de regenerarlo:
 *
 *   node scripts/build.mjs          # escribe ./dsh-desktop
 *   node scripts/build.mjs --check  # falla si ./dsh-desktop está desactualizado
 */
import { chmodSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'dsh-desktop')
const templatePath = path.join(root, 'src', 'launcher', 'dsh-desktop.in')
const mainPath = path.join(root, 'src', 'electron', 'main.js')
const splashPath = path.join(root, 'src', 'electron', 'splash.html')
const packagePath = path.join(root, 'src', 'electron', 'package.json')
const iconPath = path.join(root, 'assets', 'icon-192.png')

const read = (file) => readFileSync(file, 'utf8')

function insert(source, token, value, { stripTrailingNewline = true } = {}) {
  if (!source.includes(token)) {
    throw new Error(`falta el marcador ${token} en ${path.relative(root, templatePath)}`)
  }
  const content = stripTrailingNewline ? value.replace(/\n$/, '') : value
  return source.replaceAll(token, content)
}

export function render() {
  const template = read(templatePath)
  const main = read(mainPath)
  const splash = read(splashPath)
  const packageJson = read(packagePath)
  const icon = readFileSync(iconPath)

  for (const [name, content] of [
    ['DSH_MAIN_JS', main],
    ['DSH_SPLASH_HTML', splash],
    ['DSH_PACKAGE_JSON', packageJson],
  ]) {
    if (content.includes(name)) {
      throw new Error(`el contenido de ${name} no puede contener el terminador ${name}`)
    }
  }

  let output = template
  output = insert(output, '@@DSH_MAIN_JS@@', main)
  output = insert(output, '@@DSH_SPLASH_HTML@@', splash)
  output = insert(output, '@@DSH_PACKAGE_JSON@@', packageJson)
  output = insert(output, '@@ICON_BASE64@@', icon.toString('base64'), {
    stripTrailingNewline: false,
  })

  const leftover = output.match(/@@[A-Z0-9_]+@@/)
  if (leftover) throw new Error(`quedó un marcador sin reemplazar: ${leftover[0]}`)
  return output
}

function ensureBashSyntax(file) {
  const result = spawnSync('bash', ['-n', file], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`bash -n falló para ${path.relative(root, file)}:\n${result.stderr}`)
  }
}

function main() {
  const output = render()
  const check = process.argv.includes('--check')

  if (check) {
    let current = ''
    try {
      current = readFileSync(target, 'utf8')
    } catch {
      console.error('dsh-desktop no existe; ejecuta `npm run build`.')
      process.exit(1)
    }
    if (current !== output) {
      console.error('dsh-desktop está desactualizado; ejecuta `npm run build` y vuelve a commitearlo.')
      process.exit(1)
    }
    console.log('dsh-desktop está actualizado.')
    return
  }

  const temporary = `${target}.tmp`
  writeFileSync(temporary, output, { mode: 0o755 })
  try {
    ensureBashSyntax(temporary)
    renameSync(temporary, target)
    chmodSync(target, 0o755)
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
  const size = statSync(target).size
  console.log(`dsh-desktop generado (${size.toLocaleString('es')} bytes).`)
}

main()
