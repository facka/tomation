// Verification script for DSL task 1.1
// Tests all sub-tasks against the requirements

const dsl = require('./index.js');
const {
  is, Element,
  innerTextIs, innerTextContains, classIncludes, placeholderIs, nameIs, typeIs, idIs,
  Task, Test,
  Click, Type, TypePassword, Select,
  AssertExists, AssertNotExists, AssertHasText,
  Navigate, Wait, WaitFor, WaitForGone, Manual
} = dsl;

let pass = 0;
let fail = 0;

function assert(condition, msg) {
  if (condition) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${msg}`);
  }
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --- 1. is Proxy returns ElementBuilder for uppercase property ---
console.log('\n--- is Proxy ---');

const btn = is.BUTTON;
assert(btn instanceof Object, 'is.BUTTON returns an object');
assert(typeof btn.where === 'function', 'is.BUTTON has .where()');
assert(typeof btn.childOf === 'function', 'is.BUTTON has .childOf()');
assert(typeof btn.as === 'function', 'is.BUTTON has .as()');

const inputEl = is.INPUT;
assert(typeof inputEl.as === 'function', 'is.INPUT has .as()');

// Tag should be lowercase
const desc1 = is.BUTTON.as('My Button');
assert(desc1.tag === 'button', `is.BUTTON.as() tag is 'button', got: ${desc1.tag}`);
assert(desc1.label === 'My Button', `label is 'My Button', got: ${desc1.label}`);
assert(deepEqual(desc1.where, {}), `where is {} when no .where() called, got: ${JSON.stringify(desc1.where)}`);
assert(desc1.__el === true, 'descriptor has __el marker');

const desc2 = is.DIV.as('Container');
assert(desc2.tag === 'div', `is.DIV.as() tag is 'div', got: ${desc2.tag}`);

// Non-uppercase should return undefined
assert(is.button === undefined, 'is.button (lowercase) returns undefined');

// --- 2. is.ELEMENT(xpath) returns XPathElementBuilder ---
console.log('\n--- is.ELEMENT(xpath) ---');

const xpathBuilder = is.ELEMENT('//div[@class="test"]');
assert(typeof xpathBuilder.as === 'function', 'is.ELEMENT(xpath) has .as()');

const xpathDesc = is.ELEMENT('//div[@class="test"]').as('Test Div');
assert(xpathDesc.tag === '*', `is.ELEMENT() tag is '*', got: ${xpathDesc.tag}`);
assert(xpathDesc.label === 'Test Div', `label is 'Test Div', got: ${xpathDesc.label}`);
assert(deepEqual(xpathDesc.where, {}), `where is {}, got: ${JSON.stringify(xpathDesc.where)}`);
assert(xpathDesc.xpath === '//div[@class="test"]', `xpath is correct, got: ${xpathDesc.xpath}`);
assert(xpathDesc.__el === true, 'xpath descriptor has __el marker');

// --- 3. Element(xpath) standalone function ---
console.log('\n--- Element(xpath) ---');

const elBuilder = Element('//input[@name="user"]');
assert(typeof elBuilder.as === 'function', 'Element(xpath) has .as()');

const elDesc = Element('//input[@name="user"]').as('Username Field');
assert(elDesc.tag === '*', `Element() tag is '*', got: ${elDesc.tag}`);
assert(elDesc.label === 'Username Field', `label is correct, got: ${elDesc.label}`);
assert(deepEqual(elDesc.where, {}), `where is {}, got: ${JSON.stringify(elDesc.where)}`);
assert(elDesc.xpath === '//input[@name="user"]', `xpath is correct, got: ${elDesc.xpath}`);

// Element(xpath).as() and is.ELEMENT(xpath).as() should produce equivalent descriptors
const equiv1 = Element('//a').as('Link');
const equiv2 = is.ELEMENT('//a').as('Link');
assert(deepEqual(equiv1, equiv2), 'Element(xpath).as() and is.ELEMENT(xpath).as() produce identical descriptors');

// --- 4. ElementBuilder chaining ---
console.log('\n--- ElementBuilder chaining ---');

// .where() chains
const withWhere = is.BUTTON.where(innerTextIs('Login')).as('Login Btn');
assert(withWhere.tag === 'button', 'where chain: tag is button');
assert(withWhere.label === 'Login Btn', 'where chain: label is correct');
assert(deepEqual(withWhere.where, { textIs: 'Login' }), `where chain: where is {textIs:'Login'}, got: ${JSON.stringify(withWhere.where)}`);

// .childOf() chains
const parent = is.DIV.where(classIncludes('container')).as('Container');
const child = is.BUTTON.where(innerTextIs('Submit')).childOf(parent).as('Submit Btn');
assert(child.tag === 'button', 'childOf chain: tag is button');
assert(child.childOf === parent, 'childOf chain: childOf references parent descriptor');
assert(child.label === 'Submit Btn', 'childOf chain: label is correct');
assert(deepEqual(child.where, { textIs: 'Submit' }), 'childOf chain: where matcher is correct');

// .where() before .childOf() also works
const child2 = is.INPUT.where(nameIs('email')).childOf(parent).as('Email');
assert(child2.childOf === parent, '.where().childOf().as() chains correctly');
assert(deepEqual(child2.where, { name: 'email' }), '.where() before .childOf() preserves matcher');

// --- 5. XPathElementBuilder .as() ---
console.log('\n--- XPathElementBuilder .as() ---');

const xpDesc = Element('//table/tr[1]').as('First Row');
assert(xpDesc.tag === '*', 'XPathElementBuilder.as() tag is *');
assert(xpDesc.xpath === '//table/tr[1]', 'XPathElementBuilder.as() xpath is correct');
assert(deepEqual(xpDesc.where, {}), 'XPathElementBuilder.as() where is empty');

// --- 6. Matcher factories ---
console.log('\n--- Matcher factories ---');

assert(deepEqual(innerTextIs('Hello'), { textIs: 'Hello' }), 'innerTextIs returns {textIs}');
assert(deepEqual(innerTextContains('world'), { textContains: 'world' }), 'innerTextContains returns {textContains}');
assert(deepEqual(classIncludes('active'), { classIncludes: 'active' }), 'classIncludes returns {classIncludes}');
assert(deepEqual(placeholderIs('Enter name'), { placeholder: 'Enter name' }), 'placeholderIs returns {placeholder}');
assert(deepEqual(nameIs('username'), { name: 'username' }), 'nameIs returns {name}');
assert(deepEqual(typeIs('email'), { type: 'email' }), 'typeIs returns {type}');
assert(deepEqual(idIs('submit-btn'), { id: 'submit-btn' }), 'idIs returns {id}');

// --- 7. Task and Test stubs ---
console.log('\n--- Task and Test ---');

const myTask = Task('login', (params) => { });
assert(myTask.__task === true, 'Task returns object with __task:true');
assert(myTask.name === 'login', 'Task name is correct');
assert(typeof myTask.fn === 'function', 'Task fn is stored');

const myTest = Test('login flow', () => { });
assert(myTest.__test === true, 'Test returns object with __test:true');
assert(myTest.name === 'login flow', 'Test name is correct');
assert(typeof myTest.fn === 'function', 'Test fn is stored');

// --- 8. Action stubs (all 12) ---
console.log('\n--- Action stubs ---');

const el = is.BUTTON.as('Btn');

// Click
const clickStep = Click(el);
assert(clickStep.__step === true, 'Click has __step:true');
assert(clickStep.action === 'click', 'Click action is click');
assert(clickStep.target === el, 'Click target is correct');

// Type with .in() chain
const typeResult = Type('hello');
assert(typeResult.__step === true, 'Type has __step:true');
assert(typeResult.action === 'type', 'Type action is type');
assert(typeResult.value === 'hello', 'Type value is correct');
assert(typeof typeResult.in === 'function', 'Type has .in() method');

const typeInEl = Type('hello').in(el);
assert(typeInEl.__step === true, 'Type().in() has __step:true');
assert(typeInEl.action === 'type', 'Type().in() action is type');
assert(typeInEl.target === el, 'Type().in() target is correct');
assert(typeInEl.value === 'hello', 'Type().in() value is correct');

// TypePassword with .in() chain
const tpResult = TypePassword('secret');
assert(tpResult.__step === true, 'TypePassword has __step:true');
assert(tpResult.action === 'typePassword', 'TypePassword action is typePassword');
assert(typeof tpResult.in === 'function', 'TypePassword has .in() method');

const tpInEl = TypePassword('secret').in(el);
assert(tpInEl.action === 'typePassword', 'TypePassword().in() action is typePassword');
assert(tpInEl.target === el, 'TypePassword().in() target is correct');
assert(tpInEl.value === 'secret', 'TypePassword().in() value is correct');

// Select with .in() chain
const selResult = Select('option1');
assert(selResult.__step === true, 'Select has __step:true');
assert(selResult.action === 'select', 'Select action is select');
assert(typeof selResult.in === 'function', 'Select has .in() method');

const selInEl = Select('option1').in(el);
assert(selInEl.action === 'select', 'Select().in() action is select');
assert(selInEl.target === el, 'Select().in() target is correct');
assert(selInEl.value === 'option1', 'Select().in() value is correct');

// AssertExists
const aeStep = AssertExists(el);
assert(aeStep.__step === true, 'AssertExists has __step:true');
assert(aeStep.action === 'assertExists', 'AssertExists action is assertExists');
assert(aeStep.target === el, 'AssertExists target is correct');

// AssertNotExists
const aneStep = AssertNotExists(el);
assert(aneStep.__step === true, 'AssertNotExists has __step:true');
assert(aneStep.action === 'assertNotExists', 'AssertNotExists action is assertNotExists');
assert(aneStep.target === el, 'AssertNotExists target is correct');

// AssertHasText
const ahtStep = AssertHasText(el, 'expected text');
assert(ahtStep.__step === true, 'AssertHasText has __step:true');
assert(ahtStep.action === 'assertHasText', 'AssertHasText action is assertHasText');
assert(ahtStep.target === el, 'AssertHasText target is correct');
assert(ahtStep.value === 'expected text', 'AssertHasText value is correct');

// Navigate
const navStep = Navigate('https://example.com');
assert(navStep.__step === true, 'Navigate has __step:true');
assert(navStep.action === 'navigate', 'Navigate action is navigate');
assert(navStep.url === 'https://example.com', 'Navigate url is correct');

// Wait
const waitStep = Wait(2000);
assert(waitStep.__step === true, 'Wait has __step:true');
assert(waitStep.action === 'wait', 'Wait action is wait');
assert(waitStep.ms === 2000, 'Wait ms is correct');

// WaitFor
const wfStep = WaitFor(el);
assert(wfStep.__step === true, 'WaitFor has __step:true');
assert(wfStep.action === 'waitFor', 'WaitFor action is waitFor');
assert(wfStep.target === el, 'WaitFor target is correct');
assert(wfStep.gone === false, 'WaitFor gone is false');

// WaitForGone
const wfgStep = WaitForGone(el);
assert(wfgStep.__step === true, 'WaitForGone has __step:true');
assert(wfgStep.action === 'waitFor', 'WaitForGone action is waitFor');
assert(wfgStep.target === el, 'WaitForGone target is correct');
assert(wfgStep.gone === true, 'WaitForGone gone is true');

// Manual
const manStep = Manual('Check the page visually');
assert(manStep.__step === true, 'Manual has __step:true');
assert(manStep.action === 'manual', 'Manual action is manual');
assert(manStep.description === 'Check the page visually', 'Manual description is correct');

// --- 9. Exports completeness ---
console.log('\n--- Export completeness ---');
const expectedExports = [
  'is', 'Element',
  'innerTextIs', 'innerTextContains', 'classIncludes', 'placeholderIs', 'nameIs', 'typeIs', 'idIs',
  'Task', 'Test',
  'Click', 'Type', 'TypePassword', 'Select',
  'AssertExists', 'AssertNotExists', 'AssertHasText',
  'Navigate', 'Wait', 'WaitFor', 'WaitForGone', 'Manual'
];
for (const name of expectedExports) {
  assert(dsl[name] !== undefined, `'${name}' is exported`);
}

// --- Summary ---
console.log(`\n=============================`);
console.log(`Results: ${pass} passed, ${fail} failed`);
console.log(`=============================`);

if (fail > 0) {
  process.exit(1);
}
