'use strict';

/**
 * Tests for parser.js — element/Task/Test AST extraction.
 *
 * Validates: Requirements 12.5
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseFile } = require('./parser.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Write a temporary JS file and return its absolute path.
 * The caller is responsible for cleanup (or it gets left in os.tmpdir()).
 */
function writeTmp(content, suffix) {
  const filePath = path.join(os.tmpdir(), 'tomation-test-' + Date.now() + '-' + Math.random().toString(36).slice(2) + (suffix || '.pom.js'));
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

// ---------------------------------------------------------------------------
// Requirement 12.5: Parser reports errors with file path and line number
// ---------------------------------------------------------------------------

test('parseFile: reports syntax errors with file path and line number', () => {
  const src = `
const x = {
  broken syntax here !!!@#$
`;
  const filePath = writeTmp(src, '.pom.js');
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.ok(result.error !== null, 'should have an error');
  assert.ok(typeof result.error.message === 'string');
  assert.ok(result.error.message.includes(filePath), 'error message should contain file path');
  assert.ok(typeof result.error.line === 'number');
  assert.ok(result.error.line > 0, 'error line should be > 0');
});

test('parseFile: reports file-not-found errors with file path', () => {
  const result = parseFile('/nonexistent/path/to/file.pom.js');

  assert.ok(result.error !== null);
  assert.ok(typeof result.error.message === 'string');
  assert.ok(result.error.message.includes('/nonexistent/path/to/file.pom.js'));
  assert.equal(result.error.line, 0);
});

test('parseFile: error message includes line number in expected format', () => {
  // Syntax error on a specific line
  const src = [
    "const x = 1;",
    "// line 2 comment",
    "// line 3 comment",
    "const broken = {{{;",  // line 4 — syntax error
  ].join('\n');

  const filePath = writeTmp(src, '.pom.js');
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.ok(result.error !== null);
  // Error message format: "Parse error in <file>:<line>: <detail>"
  assert.match(result.error.message, /Parse error in .+:\d+:/);
  assert.ok(result.error.message.includes(filePath));
});

// ---------------------------------------------------------------------------
// File type detection
// ---------------------------------------------------------------------------

test('parseFile: detects POM file from .pom.js extension', () => {
  const src = `
const loginBtn = is.BUTTON.where(innerTextIs('Login')).as('Login Button');
`;
  const filePath = writeTmp(src, '.pom.js');
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.equal(result.error, null);
  assert.equal(result.type, 'pom');
  assert.equal(result.elements.length, 1);
});

// ---------------------------------------------------------------------------
// Return shape completeness
// ---------------------------------------------------------------------------

test('parseFile: always returns all required fields', () => {
  const src = `
const btn = is.BUTTON.where(idIs('x')).as('Button');
`;
  const filePath = writeTmp(src, '.pom.js');
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.ok('filePath' in result);
  assert.ok('type' in result);
  assert.ok('tests' in result);
  assert.ok('elements' in result);
  assert.ok('tasks' in result);
  assert.ok('error' in result);
  assert.ok(Array.isArray(result.tests));
  assert.ok(Array.isArray(result.elements));
  assert.ok(Array.isArray(result.tasks));
  assert.equal(result.filePath, filePath);
});

test('parseFile: returns error object with correct shape on parse failure', () => {
  const src = `!!!! not valid JS at all !!!!`;
  const filePath = writeTmp(src, '.pom.js');
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.ok(result.error !== null);
  assert.ok('message' in result.error);
  assert.ok('line' in result.error);
  assert.ok(typeof result.error.message === 'string');
  assert.ok(typeof result.error.line === 'number');
  // filePath and type should still be set
  assert.equal(result.filePath, filePath);
  assert.ok(Array.isArray(result.tests));
  assert.ok(Array.isArray(result.elements));
  assert.ok(Array.isArray(result.tasks));
});
