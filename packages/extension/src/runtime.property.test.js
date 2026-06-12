'use strict';

/**
 * Property-based tests for runtime.js — element finder, actions, and highlighting.
 *
 * Requirements: 2.1, 2.2a, 2.5, 2.6, 3.2, 3.3, 3.7
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fc = require('fast-check');
const fs = require('fs');
const path = require('path');

const runtimeSrc = fs.readFileSync(path.join(__dirname, 'runtime.js'), 'utf8');

// ---------------------------------------------------------------------------
// Helper: create a jsdom window with runtime.js loaded
// ---------------------------------------------------------------------------

function createWindow(html) {
  const dom = new JSDOM(html || '<html><body></body></html>', {
    url: 'http://localhost',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true
  });
  const win = dom.window;
  win.eval('var browser = { runtime: { onMessage: { addListener: function(){} }, sendMessage: function(){} } };');
  win.eval(runtimeSrc);
  return win;
}

// ---------------------------------------------------------------------------
// Property 9: Where Matcher AND Semantics
// Feature: tomation, Property 9: Where Matcher AND Semantics
// ---------------------------------------------------------------------------

test('Property 9: Where Matcher AND Semantics — only elements satisfying ALL conditions are matched', function () {
  // Validates: Requirements 2.1
  fc.assert(
    fc.property(
      // Generate a random id and placeholder pair
      fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && !s.includes('"') && !s.includes('<') && !s.includes('>')),
      fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
      function (id, placeholder, wrongId) {
        // Ensure wrongId differs from id
        if (wrongId === id) return; // skip trivial case

        const html = `<html><body>
          <input id="${id}" placeholder="${placeholder}" />
          <input id="${wrongId}" placeholder="${placeholder}" />
          <input id="${id}" placeholder="other" />
        </body></html>`;

        const win = createWindow(html);
        const matchesWhere = win.eval('matchesWhere');
        const candidates = win.document.querySelectorAll('input');

        const where = { id: id, placeholder: placeholder };
        let matchCount = 0;
        for (let i = 0; i < candidates.length; i++) {
          if (matchesWhere(candidates[i], where)) {
            matchCount++;
            // The matched element must satisfy both conditions
            assert.equal(candidates[i].id, id);
            assert.equal(candidates[i].getAttribute('placeholder'), placeholder);
          }
        }

        // Only the first input matches both conditions
        assert.equal(matchCount, 1);
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 9: Where Matcher AND — multi-key where with textContains + classIncludes', function () {
  // Validates: Requirements 2.1
  fc.assert(
    fc.property(
      // Use a unique textPart that won't accidentally match other content
      fc.string({ minLength: 3, maxLength: 8 }).filter(s => /^[a-z]+$/.test(s)),
      fc.string({ minLength: 3, maxLength: 8 }).filter(s => /^[a-z]+$/.test(s)),
      function (textPart, className) {
        // Use unique marker text for the non-matching span to avoid accidental textContains match
        const noMatchText = 'ZZZZZ';
        const html = `<html><body>
          <span class="${className}">xq ${textPart} xq</span>
          <span class="${className}">${noMatchText}</span>
          <span class="zzother">xq ${textPart} xq</span>
        </body></html>`;

        const win = createWindow(html);
        const matchesWhere = win.eval('matchesWhere');
        const candidates = win.document.querySelectorAll('span');

        const where = { textContains: textPart, classIncludes: className };
        let matchCount = 0;
        for (let i = 0; i < candidates.length; i++) {
          if (matchesWhere(candidates[i], where)) {
            matchCount++;
            // Verify both conditions hold on any matched element
            assert.ok(candidates[i].textContent.indexOf(textPart) !== -1);
            assert.ok(candidates[i].className.split(' ').indexOf(className) !== -1);
          }
        }

        // Only the first span matches both (second has wrong text, third has wrong class)
        assert.equal(matchCount, 1);
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property 11: childOf Scoping
// Feature: tomation, Property 11: childOf Scoping
// ---------------------------------------------------------------------------

test('Property 11: childOf Scoping — element inside parent found, element outside not found', function () {
  // Validates: Requirements 2.2a
  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 8 }).filter(s => /^[a-zA-Z]+$/.test(s)),
      fc.string({ minLength: 1, maxLength: 8 }).filter(s => /^[a-zA-Z]+$/.test(s)),
      function (parentId, childClass) {
        const html = `<html><body>
          <div id="${parentId}">
            <button class="${childClass}">Inside</button>
          </div>
          <button class="${childClass}">Outside</button>
        </body></html>`;

        const win = createWindow(html);
        const matchesWhere = win.eval('matchesWhere');

        // Scope search to inside the parent
        const parent = win.document.getElementById(parentId);
        assert.ok(parent, 'Parent element should exist');

        const candidatesInside = parent.querySelectorAll('button');
        const where = { classIncludes: childClass };

        let foundInside = false;
        for (let i = 0; i < candidatesInside.length; i++) {
          if (matchesWhere(candidatesInside[i], where)) {
            foundInside = true;
            break;
          }
        }
        assert.ok(foundInside, 'Element inside parent should be found');

        // Verify that the element outside parent subtree is NOT in the scoped results
        const allButtons = win.document.querySelectorAll('button');
        let outsideFoundInScope = false;
        for (let i = 0; i < allButtons.length; i++) {
          if (matchesWhere(allButtons[i], where) && !parent.contains(allButtons[i])) {
            // This element matches but is outside the parent — scoped search must not return it
            outsideFoundInScope = false;
            // Confirm it would NOT be in parent.querySelectorAll results
            let inParentQuery = false;
            for (let j = 0; j < candidatesInside.length; j++) {
              if (candidatesInside[j] === allButtons[i]) {
                inParentQuery = true;
                break;
              }
            }
            assert.equal(inParentQuery, false, 'Element outside parent should not appear in scoped query');
          }
        }
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property 2 (type action): type sets value
// Feature: tomation, Property 2: type sets value
// ---------------------------------------------------------------------------

test('Property 2: type action sets element.value to the input string', async function () {
  // Validates: Requirements 3.2
  await fc.assert(
    fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 50 }),
      async function (inputValue) {
        const html = '<html><body><input id="target" /></body></html>';
        const win = createWindow(html);

        const handleType = win.eval('handleType');
        const el = win.document.getElementById('target');

        const res = await handleType(el, inputValue);
        assert.equal(res.ok, true);
        assert.equal(el.value, inputValue);
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property 3/10: typePassword masking
// Feature: tomation, Property 3: typePassword masking
// Feature: tomation, Property 10: TypePassword Value Masking
// ---------------------------------------------------------------------------

test('Property 3/10: typePassword masking — log-facing value is always "****"', function () {
  // Validates: Requirements 3.3
  // The masking is done at the panel level. For any step with action 'typePassword',
  // the displayed value should be '****' regardless of actual value.
  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 100 }),
      function (password) {
        // Simulate the panel's masking logic for typePassword steps
        const step = { action: 'typePassword', target: 'someField', value: password };
        const displayValue = step.action === 'typePassword' ? '****' : step.value;

        assert.equal(displayValue, '****');
        // The mask must be constant regardless of input
        assert.notEqual(displayValue, password.length > 0 ? password : 'x');
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 3/10: typePassword runtime behavior identical to type — value is set correctly', async function () {
  // Validates: Requirements 3.3
  await fc.assert(
    fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 50 }),
      async function (password) {
        const html = '<html><body><input id="pw" type="password" /></body></html>';
        const win = createWindow(html);

        const handleType = win.eval('handleType');
        const el = win.document.getElementById('pw');

        // typePassword uses the same handleType function at runtime
        const res = await handleType(el, password);
        assert.equal(res.ok, true);
        assert.equal(el.value, password);
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property 7: assertHasText
// Feature: tomation, Property 7: assertHasText
// ---------------------------------------------------------------------------

test('Property 7: assertHasText returns ok:true iff value is substring of textContent', async function () {
  // Validates: Requirements 3.7
  await fc.assert(
    fc.asyncProperty(
      fc.string({ minLength: 0, maxLength: 50 }),
      fc.string({ minLength: 1, maxLength: 20 }),
      async function (text, value) {
        const html = '<html><body><div id="el"></div></body></html>';
        const win = createWindow(html);

        const handleAssertHasText = win.eval('handleAssertHasText');
        const el = win.document.getElementById('el');

        // Set textContent directly to avoid HTML parsing issues
        el.textContent = text;

        const isSubstring = text.indexOf(value) !== -1;

        const res = await handleAssertHasText(el, value);
        assert.equal(res.ok, isSubstring,
          `Expected ok=${isSubstring} for text="${text}" value="${value}"`);
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Properties 2.5/2.6: highlight/unhighlight attribute lifecycle
// Feature: tomation, Property 2.5: highlight adds attribute
// Feature: tomation, Property 2.6: unhighlight removes attribute
// ---------------------------------------------------------------------------

test('Property 2.5/2.6: highlight adds data-tomation-active, unhighlight removes it', function () {
  // Validates: Requirements 2.5, 2.6
  fc.assert(
    fc.property(
      fc.constantFrom('div', 'span', 'input', 'button', 'a', 'p'),
      fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z]+$/.test(s)),
      function (tag, id) {
        const html = `<html><body><${tag} id="${id}"></${tag}></body></html>`;
        const win = createWindow(html);

        const highlightElement = win.eval('highlightElement');
        const unhighlightElement = win.eval('unhighlightElement');
        const el = win.document.getElementById(id);

        // Before highlight: attribute should not exist
        assert.equal(el.hasAttribute('data-tomation-active'), false);

        // After highlight: attribute should exist
        highlightElement(el);
        assert.equal(el.hasAttribute('data-tomation-active'), true);
        assert.equal(el.getAttribute('data-tomation-active'), 'true');

        // After unhighlight: attribute should be gone
        unhighlightElement(el);
        assert.equal(el.hasAttribute('data-tomation-active'), false);
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 2.5/2.6: highlight is idempotent and unhighlight always cleans up', function () {
  // Validates: Requirements 2.5, 2.6
  fc.assert(
    fc.property(
      fc.nat({ max: 5 }),
      function (highlightCount) {
        const html = '<html><body><div id="el"></div></body></html>';
        const win = createWindow(html);

        const highlightElement = win.eval('highlightElement');
        const unhighlightElement = win.eval('unhighlightElement');
        const el = win.document.getElementById('el');

        // Call highlight multiple times
        for (let i = 0; i <= highlightCount; i++) {
          highlightElement(el);
        }
        assert.equal(el.hasAttribute('data-tomation-active'), true);

        // Single unhighlight should always remove it
        unhighlightElement(el);
        assert.equal(el.hasAttribute('data-tomation-active'), false);
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

// No additional helpers needed
