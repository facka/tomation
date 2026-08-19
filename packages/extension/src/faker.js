// faker.js — lightweight fake data generator for Tomation extension runtime
// Zero external dependencies. Uses bundled data arrays.

'use strict';

// ─── Seeded PRNG (Mulberry32) ────────────────────────────────────────────────

/**
 * Mulberry32 — a fast 32-bit seeded PRNG.
 * @param {number} seed - integer seed value
 * @returns {function} function that returns float in [0, 1) each call
 */
function mulberry32(seed) {
  var state = seed | 0;
  return function() {
    state = (state + 0x6D2B79F5) | 0;
    var t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Active random function — either a seeded PRNG or null (use Math.random).
 * Set by resolveTestData when processing a seeded template.
 */
var _activeRandom = null;

/**
 * Get the current random function (seeded or Math.random).
 * @returns {number} float in [0, 1)
 */
function rng() {
  return _activeRandom ? _activeRandom() : Math.random();
}

/**
 * Set the active seeded PRNG. Pass null to revert to Math.random.
 * @param {function|null} fn
 */
function setSeededRandom(fn) {
  _activeRandom = fn;
}

// ─── Data Arrays ─────────────────────────────────────────────────────────────

var MALE_FIRST_NAMES = ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles', 'Christopher', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth'];

var FEMALE_FIRST_NAMES = ['Mary', 'Patricia', 'Jennifer', 'Linda', 'Barbara', 'Elizabeth', 'Susan', 'Jessica', 'Sarah', 'Karen', 'Lisa', 'Nancy', 'Betty', 'Margaret', 'Sandra', 'Ashley', 'Dorothy', 'Kimberly', 'Emily', 'Donna'];

var LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];

var STREETS = ['Main St', 'Oak Ave', 'Maple Dr', 'Cedar Ln', 'Elm St', 'Pine Rd', 'Birch Blvd', 'Walnut Way', 'Cherry Ct', 'Willow Pl'];

var CITIES = ['Springfield', 'Portland', 'Franklin', 'Greenville', 'Bristol', 'Fairview', 'Salem', 'Madison', 'Georgetown', 'Arlington'];

var COUNTRIES = ['United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Spain', 'Italy', 'Netherlands', 'Sweden'];

var EMAIL_DOMAINS = ['example.com', 'test.org', 'mail.net', 'demo.io', 'sample.dev'];

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Pick a random element from an array.
 * @param {Array} arr
 * @returns {*}
 */
function pick(arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Generate a random integer in [min, max] inclusive.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomInt(min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Generate N random digits as a string.
 * @param {number} n
 * @returns {string}
 */
function randomDigits(n) {
  var result = '';
  for (var i = 0; i < n; i++) {
    result += String(Math.floor(rng() * 10));
  }
  return result;
}


// ─── Date Formatting Helper ──────────────────────────────────────────────────

/**
 * Format a Date object using a format string.
 * Supported tokens: YYYY, MM, DD, M, D
 * @param {Date} date
 * @param {string} format
 * @returns {string}
 */
function formatDate(date, format) {
  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  var day = date.getDate();

  var result = format;
  result = result.replace('YYYY', String(year));
  result = result.replace('MM', (month < 10 ? '0' : '') + month);
  result = result.replace('DD', (day < 10 ? '0' : '') + day);
  result = result.replace('M', String(month));
  result = result.replace('D', String(day));
  return result;
}

// ─── Generator Functions ─────────────────────────────────────────────────────

/**
 * Generate a random first name.
 * @param {object} options - { gender?: 'male' | 'female' }
 * @returns {string}
 */
function generateFirstName(options) {
  var gender = options && options.gender;
  if (gender === 'male') return pick(MALE_FIRST_NAMES);
  if (gender === 'female') return pick(FEMALE_FIRST_NAMES);
  // Random gender
  return rng() < 0.5 ? pick(MALE_FIRST_NAMES) : pick(FEMALE_FIRST_NAMES);
}

/**
 * Generate a random last name.
 * @returns {string}
 */
function generateLastName() {
  return pick(LAST_NAMES);
}

/**
 * Generate a full name (first + last).
 * @param {object} options - { gender?: 'male' | 'female' }
 * @returns {string}
 */
function generateFullName(options) {
  return generateFirstName(options) + ' ' + generateLastName();
}

/**
 * Generate a random date of birth within age constraints.
 * Algorithm:
 *   1. Determine minAge (default 18) and maxAge (default 65)
 *   2. Calculate the latest possible birth date (today - minAge years)
 *   3. Calculate the earliest possible birth date (today - (maxAge+1) years + 1 day)
 *   4. Pick a random timestamp between earliest and latest
 *   5. Format using the provided format string (default 'YYYY-MM-DD')
 *
 * @param {object} options - { minAge?: number, maxAge?: number, format?: string }
 * @returns {string}
 */
function generateDateOfBirth(options) {
  var minAge = (options && options.minAge !== undefined) ? options.minAge : 18;
  var maxAge = (options && options.maxAge !== undefined) ? options.maxAge : 65;
  var format = (options && options.format) || 'YYYY-MM-DD';

  var now = new Date();
  // Latest birth date: person is exactly minAge today
  var latest = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate());
  // Earliest birth date: person turns maxAge+1 tomorrow → born on this date maxAge+1 years ago + 1 day
  var earliest = new Date(now.getFullYear() - maxAge - 1, now.getMonth(), now.getDate() + 1);

  var range = latest.getTime() - earliest.getTime();
  var randomTime = earliest.getTime() + Math.floor(rng() * range);
  var dob = new Date(randomTime);

  return formatDate(dob, format);
}

/**
 * Generate a phone number for the specified country.
 * Patterns:
 *   US: (XXX) XXX-XXXX
 *   UK: +44 XXXX XXXXXX
 *   ES: +34 XXX XXX XXX
 *
 * @param {object} options - { country?: 'US' | 'UK' | 'ES' }
 * @returns {string}
 */
function generatePhone(options) {
  var country = (options && options.country) || 'US';

  switch (country) {
    case 'US':
      return '(' + randomDigits(3) + ') ' + randomDigits(3) + '-' + randomDigits(4);
    case 'UK':
      return '+44 ' + randomDigits(4) + ' ' + randomDigits(6);
    case 'ES':
      return '+34 ' + randomDigits(3) + ' ' + randomDigits(3) + ' ' + randomDigits(3);
    default:
      throw new Error('Unsupported country for phone generation: ' + country);
  }
}

/**
 * Generate an address or address component.
 * @param {object} options - { part?: 'full' | 'street' | 'city' | 'country' | 'zip' }
 * @returns {string}
 */
function generateAddress(options) {
  var part = (options && options.part) || 'full';

  switch (part) {
    case 'street':
      return randomInt(100, 9999) + ' ' + pick(STREETS);
    case 'city':
      return pick(CITIES);
    case 'country':
      return pick(COUNTRIES);
    case 'zip':
      return randomDigits(5);
    case 'full':
    default:
      return randomInt(100, 9999) + ' ' + pick(STREETS) + ', ' + pick(CITIES) + ' ' + randomDigits(5);
  }
}

/**
 * Generate a syntactically valid random email address.
 * Format: {adjective}{noun}{digits}@{domain}
 * @returns {string}
 */
function generateEmail() {
  var adjectives = ['happy', 'clever', 'swift', 'bright', 'cool', 'fast', 'keen', 'bold'];
  var nouns = ['fox', 'wolf', 'hawk', 'bear', 'deer', 'lynx', 'owl', 'seal'];
  var local = pick(adjectives) + pick(nouns) + randomInt(10, 999);
  return local + '@' + pick(EMAIL_DOMAINS);
}

/**
 * Pick a random value from a provided array.
 * @param {object} options - { values: string[] }
 * @returns {string}
 * @throws {Error} if values array is empty (should be caught at compile time)
 */
function generateOneOf(options) {
  var values = options && options.values;
  if (!values || values.length === 0) {
    throw new Error('Fake.oneOf requires at least one option');
  }
  return pick(values);
}

/**
 * Generate a random number within bounds.
 * @param {object} options - { min?: number, max?: number, decimals?: number }
 * @returns {number}
 */
function generateNumber(options) {
  var min = (options && options.min !== undefined) ? options.min : 0;
  var max = (options && options.max !== undefined) ? options.max : 1000;
  var decimals = (options && options.decimals !== undefined) ? options.decimals : 0;

  if (decimals === 0) {
    return randomInt(min, max);
  }

  var raw = min + rng() * (max - min);
  var factor = Math.pow(10, decimals);
  return Math.round(raw * factor) / factor;
}


// ─── UUID Generator ──────────────────────────────────────────────────────────

/**
 * Generate a random UUID v4 string.
 * @returns {string} e.g., "550e8400-e29b-41d4-a716-446655440000"
 */
function generateUuid() {
  var hex = '0123456789abcdef';
  var result = '';
  for (var i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      result += '-';
    } else if (i === 14) {
      result += '4'; // version 4
    } else if (i === 19) {
      result += hex[8 + Math.floor(rng() * 4)]; // variant bits
    } else {
      result += hex[Math.floor(rng() * 16)];
    }
  }
  return result;
}


// ─── Sentence Generator ──────────────────────────────────────────────────────

var SENTENCE_WORDS = [
  'the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog',
  'a', 'bright', 'sunny', 'day', 'brought', 'new', 'opportunities',
  'system', 'processes', 'data', 'efficiently', 'while', 'maintaining',
  'high', 'quality', 'standards', 'across', 'all', 'modules',
  'patient', 'record', 'was', 'updated', 'successfully', 'in', 'database',
  'user', 'completed', 'registration', 'form', 'with', 'valid', 'information',
  'test', 'results', 'confirmed', 'expected', 'behavior', 'of', 'application'
];

/**
 * Generate a random sentence.
 * @param {object} options - { minWords?: number, maxWords?: number }
 * @returns {string}
 */
function generateSentence(options) {
  var minWords = (options && options.minWords !== undefined) ? options.minWords : 5;
  var maxWords = (options && options.maxWords !== undefined) ? options.maxWords : 12;
  var count = randomInt(minWords, maxWords);
  var words = [];
  for (var i = 0; i < count; i++) {
    words.push(pick(SENTENCE_WORDS));
  }
  // Capitalize first word and end with period
  words[0] = words[0][0].toUpperCase() + words[0].slice(1);
  return words.join(' ') + '.';
}


// ─── Past/Future Date Generators ─────────────────────────────────────────────

/**
 * Generate a random date in the past.
 * @param {object} options - { within?: number (days, default 365), format?: string }
 * @returns {string}
 */
function generatePastDate(options) {
  var within = (options && options.within !== undefined) ? options.within : 365;
  var format = (options && options.format) || 'YYYY-MM-DD';

  var now = new Date();
  var daysBack = randomInt(1, within);
  var past = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return formatDate(past, format);
}

/**
 * Generate a random date in the future.
 * @param {object} options - { within?: number (days, default 365), format?: string }
 * @returns {string}
 */
function generateFutureDate(options) {
  var within = (options && options.within !== undefined) ? options.within : 365;
  var format = (options && options.format) || 'YYYY-MM-DD';

  var now = new Date();
  var daysAhead = randomInt(1, within);
  var future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  return formatDate(future, format);
}


// ─── Sequence Generator ──────────────────────────────────────────────────────

var _sequenceCounters = {};

/**
 * Generate a sequential value with optional prefix and zero-padding.
 * Counter increments per unique prefix across a test run.
 * @param {object} options - { prefix?: string, pad?: number }
 * @returns {string} e.g., "PAT-001", "PAT-002"
 */
function generateSequence(options) {
  var prefix = (options && options.prefix) || '';
  var pad = (options && options.pad !== undefined) ? options.pad : 0;

  if (!_sequenceCounters[prefix]) {
    _sequenceCounters[prefix] = 0;
  }
  _sequenceCounters[prefix]++;
  var num = String(_sequenceCounters[prefix]);
  if (pad > 0) {
    while (num.length < pad) {
      num = '0' + num;
    }
  }
  return prefix + num;
}

/**
 * Reset all sequence counters (called between test runs).
 */
function resetSequenceCounters() {
  _sequenceCounters = {};
}


// ─── Dispatch Function ───────────────────────────────────────────────────────

/**
 * Main dispatch function. Resolves a FakeDescriptor to a concrete value.
 * @param {object} descriptor - { type: 'fake', method: string, options: object }
 * @returns {string|number}
 */
function resolveFake(descriptor) {
  switch (descriptor.method) {
    case 'firstName':   return generateFirstName(descriptor.options);
    case 'lastName':    return generateLastName();
    case 'fullName':    return generateFullName(descriptor.options);
    case 'dateOfBirth': return generateDateOfBirth(descriptor.options);
    case 'phone':       return generatePhone(descriptor.options);
    case 'address':     return generateAddress(descriptor.options);
    case 'email':       return generateEmail();
    case 'oneOf':       return generateOneOf(descriptor.options);
    case 'number':      return generateNumber(descriptor.options);
    case 'uuid':        return generateUuid();
    case 'sentence':    return generateSentence(descriptor.options);
    case 'pastDate':    return generatePastDate(descriptor.options);
    case 'futureDate':  return generateFutureDate(descriptor.options);
    case 'sequence':    return generateSequence(descriptor.options);
    default:
      console.warn('[tomation] Unknown fake method: ' + descriptor.method);
      return '';
  }
}

// ─── Module Exports ──────────────────────────────────────────────────────────

// Support both service worker (importScripts → globals) and Node.js (require)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    resolveFake: resolveFake,
    mulberry32: mulberry32,
    setSeededRandom: setSeededRandom,
    generateFirstName: generateFirstName,
    generateLastName: generateLastName,
    generateFullName: generateFullName,
    generateDateOfBirth: generateDateOfBirth,
    generatePhone: generatePhone,
    generateAddress: generateAddress,
    generateEmail: generateEmail,
    generateOneOf: generateOneOf,
    generateNumber: generateNumber,
    generateUuid: generateUuid,
    generateSentence: generateSentence,
    generatePastDate: generatePastDate,
    generateFutureDate: generateFutureDate,
    generateSequence: generateSequence,
    resetSequenceCounters: resetSequenceCounters,
    formatDate: formatDate,
    pick: pick,
    randomInt: randomInt,
    randomDigits: randomDigits,
    rng: rng,
    MALE_FIRST_NAMES: MALE_FIRST_NAMES,
    FEMALE_FIRST_NAMES: FEMALE_FIRST_NAMES,
    LAST_NAMES: LAST_NAMES,
    STREETS: STREETS,
    CITIES: CITIES,
    COUNTRIES: COUNTRIES,
    EMAIL_DOMAINS: EMAIL_DOMAINS
  };
}
