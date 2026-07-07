#!/usr/bin/env bun
/**
 * Conventional Commits validator for git commit-msg hook.
 *
 * Format: <type>[(scope)]: <subject>
 *
 * Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
 *
 * Subject rules:
 *   - Max 72 characters
 *   - No trailing period
 *   - Imperative mood (lowercase first letter after type)
 *
 * Bypassed (valid without validation):
 *   - Merge commits: starts with "Merge "
 *   - Revert commits: starts with "Revert "
 *   - Initial commit: empty subject after type (rare)
 */
import { readFileSync } from 'node:fs'

const COMMIT_MSG_FILE = process.argv[2]
if (!COMMIT_MSG_FILE) {
  console.error('commit-msg validator: missing commit message file argument')
  process.exit(2)
}

const ALLOWED_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
]

const SUBJECT_MAX = 72

const raw = readFileSync(COMMIT_MSG_FILE, 'utf8')
const subject = raw.split('\n', 1)[0]?.trim() ?? ''

if (!subject) {
  console.error('✗ Commit message is empty')
  process.exit(1)
}

// Bypass merge / revert / squash-template-style commits
if (/^Merge\b/.test(subject) || /^Revert\b/.test(subject)) {
  process.exit(0)
}

const match = subject.match(/^([a-z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/)
if (!match) {
  console.error('✗ Commit subject does not match Conventional Commits format')
  console.error('  Expected: <type>[(scope)]: <subject>')
  console.error('  Got:     ' + subject)
  console.error('')
  console.error('  Allowed types: ' + ALLOWED_TYPES.join(', '))
  process.exit(1)
}

const [, type, scope, bang, body] = match

if (!ALLOWED_TYPES.includes(type)) {
  console.error(`✗ Unknown commit type: "${type}"`)
  console.error('  Allowed types: ' + ALLOWED_TYPES.join(', '))
  process.exit(1)
}

if (body.length > SUBJECT_MAX) {
  console.error(`✗ Commit subject too long: ${body.length} chars (max ${SUBJECT_MAX})`)
  console.error('  Subject: ' + body)
  process.exit(1)
}

if (body.endsWith('.')) {
  console.error('✗ Commit subject should not end with a period')
  console.error('  Subject: ' + body)
  process.exit(1)
}

if (body[0] && body[0] === body[0].toUpperCase()) {
  console.error('✗ Commit subject should start with a lowercase letter (imperative mood)')
  console.error('  Subject: ' + body)
  process.exit(1)
}

console.log(`✓ ${type}${scope ? '(' + scope + ')' : ''}${bang ? '!' : ''}: ${body}`)
