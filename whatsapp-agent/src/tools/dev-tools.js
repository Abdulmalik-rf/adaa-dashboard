// Developer-mode tools — give the agent the same file/shell capabilities
// that a coding assistant like Claude Code has. Used when the user says
// things like "fix this bug", "open page.tsx and add an X", "run the
// tests", etc.
//
// All paths default to the project root (the directory two levels above
// whatsapp-agent/src/tools) so the agent stays scoped to the dashboard
// project by default. Absolute paths are accepted too so the agent can
// reach anywhere on the user's laptop when explicitly asked.

import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// whatsapp-agent/src/tools/dev-tools.js → temp_zip_agency
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..')

const execP = promisify(exec)

function resolvePath(p) {
  if (!p) return PROJECT_ROOT
  if (path.isAbsolute(p)) return p
  return path.resolve(PROJECT_ROOT, p)
}

// =============================================================================
// FILE READ
// =============================================================================
export async function devReadFile(input) {
  const file = resolvePath(input.path)
  const offset = Number.isInteger(input.offset) ? input.offset : 0
  const limit = Number.isInteger(input.limit) ? input.limit : 2000
  const buf = await fs.readFile(file, 'utf8')
  const lines = buf.split(/\r?\n/)
  const slice = lines.slice(offset, offset + limit)
  const numbered = slice.map((l, i) => `${String(offset + i + 1).padStart(6, ' ')}\t${l}`).join('\n')
  return {
    path: file,
    total_lines: lines.length,
    shown_lines: slice.length,
    offset,
    truncated: offset + slice.length < lines.length,
    content: numbered,
  }
}

// =============================================================================
// FILE WRITE — full overwrite. For surgical changes, use edit_file.
// =============================================================================
export async function devWriteFile(input) {
  const file = resolvePath(input.path)
  if (typeof input.content !== 'string') throw new Error('write_file: content must be a string')
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, input.content, 'utf8')
  return { path: file, bytes: Buffer.byteLength(input.content, 'utf8') }
}

// =============================================================================
// FILE EDIT — surgical old_string → new_string replacement. Mirrors how
// I edit files: requires old_string to be unique unless replace_all is
// set, so an accidental match in a different spot can't silently
// rewrite the wrong thing.
// =============================================================================
export async function devEditFile(input) {
  const file = resolvePath(input.path)
  if (typeof input.old_string !== 'string' || typeof input.new_string !== 'string') {
    throw new Error('edit_file: old_string and new_string are required strings')
  }
  if (input.old_string === input.new_string) {
    throw new Error('edit_file: old_string and new_string are identical')
  }
  const original = await fs.readFile(file, 'utf8')
  const occurrences = original.split(input.old_string).length - 1
  if (occurrences === 0) {
    throw new Error(`edit_file: old_string not found in ${file}. Re-read the file first.`)
  }
  if (occurrences > 1 && !input.replace_all) {
    throw new Error(
      `edit_file: old_string occurs ${occurrences} times in ${file}. Either widen the snippet so it's unique, or pass replace_all=true.`,
    )
  }
  const updated = input.replace_all
    ? original.split(input.old_string).join(input.new_string)
    : original.replace(input.old_string, input.new_string)
  await fs.writeFile(file, updated, 'utf8')
  return { path: file, replaced: input.replace_all ? occurrences : 1 }
}

// =============================================================================
// LIST DIRECTORY
// =============================================================================
export async function devListDir(input) {
  const dir = resolvePath(input.path)
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const out = entries
    .map((e) => ({
      name: e.name,
      type: e.isDirectory() ? 'dir' : e.isFile() ? 'file' : 'other',
    }))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
  return { path: dir, entries: out }
}

// =============================================================================
// GLOB — recursive file pattern match. Skips .git and node_modules.
// =============================================================================
export async function devGlob(input) {
  if (!input.pattern || typeof input.pattern !== 'string') {
    throw new Error('glob: pattern is required')
  }
  const cwd = resolvePath(input.cwd)
  const re = globToRegExp(input.pattern)
  const matches = []
  const SKIP = new Set(['.git', 'node_modules', '.next', 'dist', '.turbo'])
  async function walk(dir) {
    let entries
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      const rel = path.relative(cwd, full).replace(/\\/g, '/')
      if (e.isDirectory()) {
        if (SKIP.has(e.name)) continue
        await walk(full)
      } else if (e.isFile()) {
        if (re.test(rel)) matches.push(full)
        if (matches.length >= 500) return
      }
    }
  }
  await walk(cwd)
  return { cwd, pattern: input.pattern, matches }
}

function globToRegExp(pattern) {
  // Tiny glob → regex: ** matches any segments incl. /; * matches no /;
  // ? matches one char; everything else is literal.
  let re = '^'
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '*' && pattern[i + 1] === '*') {
      re += '.*'
      i++
    } else if (c === '*') {
      re += '[^/]*'
    } else if (c === '?') {
      re += '[^/]'
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c
    } else {
      re += c
    }
  }
  re += '$'
  return new RegExp(re)
}

// =============================================================================
// GREP — content search across files. Uses ripgrep when available
// (much faster), falls back to a small JS scanner.
// =============================================================================
export async function devGrep(input) {
  if (!input.pattern || typeof input.pattern !== 'string') {
    throw new Error('grep: pattern is required')
  }
  const cwd = resolvePath(input.path)
  const max = Number.isInteger(input.max) ? input.max : 200
  // Try ripgrep first.
  try {
    const args = ['rg', '--vimgrep', '--max-count', '10', '--no-heading']
    if (input.glob) args.push('--glob', input.glob)
    if (input.case_insensitive) args.push('--ignore-case')
    args.push('--', input.pattern, cwd)
    const cmd = args.map(quoteArg).join(' ')
    const { stdout } = await execP(cmd, { maxBuffer: 4 * 1024 * 1024 })
    const lines = stdout.split(/\r?\n/).filter(Boolean).slice(0, max)
    return { engine: 'ripgrep', pattern: input.pattern, matches: lines }
  } catch {
    // Fall through to JS scan.
  }
  // JS fallback.
  const re = new RegExp(input.pattern, input.case_insensitive ? 'i' : '')
  const matches = []
  const fileFilter = input.glob ? globToRegExp(input.glob) : null
  const SKIP = new Set(['.git', 'node_modules', '.next', 'dist', '.turbo'])
  async function walk(dir) {
    let entries
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (matches.length >= max) return
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (SKIP.has(e.name)) continue
        await walk(full)
      } else if (e.isFile()) {
        const rel = path.relative(cwd, full).replace(/\\/g, '/')
        if (fileFilter && !fileFilter.test(rel)) continue
        let content
        try { content = await fs.readFile(full, 'utf8') } catch { continue }
        const lines = content.split(/\r?\n/)
        for (let i = 0; i < lines.length && matches.length < max; i++) {
          if (re.test(lines[i])) matches.push(`${full}:${i + 1}:${lines[i].slice(0, 200)}`)
        }
      }
    }
  }
  await walk(cwd)
  return { engine: 'js', pattern: input.pattern, matches }
}

function quoteArg(a) {
  if (/^[a-zA-Z0-9_\-./:\\]+$/.test(a)) return a
  return `"${a.replace(/"/g, '\\"')}"`
}

// =============================================================================
// RUN SHELL — execute a shell command. Defaults to PowerShell on Windows
// (matches what the user runs interactively), bash on POSIX. cwd defaults
// to the project root.
// =============================================================================
export async function devRunShell(input) {
  if (!input.command || typeof input.command !== 'string') {
    throw new Error('run_shell: command is required')
  }
  const cwd = resolvePath(input.cwd)
  const timeoutMs = Number.isInteger(input.timeout_ms) ? input.timeout_ms : 60_000
  const isWin = process.platform === 'win32'
  // Use PowerShell on Windows so the command syntax matches the user's
  // shell. On POSIX use /bin/sh.
  const shell = isWin ? 'powershell.exe' : '/bin/sh'
  try {
    const { stdout, stderr } = await execP(input.command, {
      cwd,
      shell,
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    })
    return {
      ok: true,
      cwd,
      stdout: (stdout || '').slice(0, 30_000),
      stderr: (stderr || '').slice(0, 8_000),
    }
  } catch (err) {
    return {
      ok: false,
      cwd,
      code: err?.code ?? null,
      signal: err?.signal ?? null,
      killed: !!err?.killed,
      stdout: (err?.stdout || '').slice(0, 30_000),
      stderr: (err?.stderr || String(err?.message || '')).slice(0, 8_000),
    }
  }
}

// Re-export the project root so executors.js can pass it into run_code
// as a sandbox global for the agent's reference.
export function devProjectRoot() {
  if (!fsSync.existsSync(PROJECT_ROOT)) {
    throw new Error(`project root not found: ${PROJECT_ROOT}`)
  }
  return { project_root: PROJECT_ROOT, platform: process.platform }
}
