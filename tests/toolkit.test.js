import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ToolError,
  analyzeText,
  atbash,
  base64Decode,
  base64Encode,
  base64UrlDecode,
  base64UrlEncode,
  binaryDecode,
  binaryEncode,
  caesarBruteforce,
  caesarDecode,
  caesarEncode,
  decodeJwt,
  decodeWith,
  encodeWith,
  hashText,
  hexDecode,
  hexEncode,
  identifyHash,
  morseDecode,
  morseEncode,
  rot13,
  urlDecode,
  urlEncode,
  vigenere,
  xorText,
} from '../src/utils/cyberToolkit.js';

test('base64, base64url, hex and binary round-trip', () => {
  assert.equal(base64Decode(base64Encode('welcome_home')), 'welcome_home');
  assert.equal(base64UrlDecode(base64UrlEncode('a+b/c?d')), 'a+b/c?d');
  assert.equal(hexDecode(hexEncode('nested signal')), 'nested signal');
  assert.equal(hexDecode('5a 32 68 76'), 'Z2hv');
  assert.equal(binaryDecode(binaryEncode('hi')), 'hi');
  assert.equal(urlDecode(urlEncode('a b&c')), 'a b&c');
  assert.equal(urlDecode('hello%20world'), 'hello world');
});

test('invalid encoded input raises a ToolError', () => {
  assert.throws(() => base64Decode('%%%not-base64%%%'), ToolError);
  assert.throws(() => hexDecode('abc'), ToolError);
  assert.throws(() => binaryDecode('1010'), ToolError);
  assert.throws(() => morseDecode('.... . .-.. .-.. --- / .-- --- .-. .-.. -.. x'), ToolError);
});

test('classical ciphers transform and reverse correctly', () => {
  assert.equal(rot13('gur juvgr enoovg'), 'the white rabbit');
  assert.equal(atbash('gsv dsrgv izyyrg'), 'the white rabbit');
  assert.equal(caesarDecode(caesarEncode('Rabbit', 7), 7), 'Rabbit');
  const rotations = caesarBruteforce('gur juvgr enoovg');
  assert.equal(rotations.length, 26);
  assert.ok(rotations.some((entry) => entry.text === 'the white rabbit'));
  assert.equal(morseDecode(morseEncode('SOS 42')), 'SOS 42');
  assert.equal(encodeWith('reverse', 'abc'), 'cba');
  assert.equal(decodeWith('reverse', 'cba'), 'abc');
});

test('vigenere decodes the bundled challenge ciphertext', () => {
  assert.equal(vigenere('hoenop vhx yhbve kcbukt', 'CAT'), 'follow the white rabbit');
  assert.equal(vigenere(vigenere('follow the white rabbit', 'CAT', { mode: 'encode' }), 'CAT'), 'follow the white rabbit');
});

test('XOR supports text and hex inputs with repeating keys', () => {
  const forward = xorText('hello', 'k');
  const back = xorText(forward.hex, 'k', { inputFormat: 'hex' });
  assert.equal(back.utf8, 'hello');
  assert.ok(/^[0-9a-f]+$/.test(forward.hex));
});

test('JWT decoding reads header, payload and algorithm', () => {
  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify({ sub: 'operator' }));
  const decoded = decodeJwt(`${header}.${payload}.`);
  assert.equal(decoded.algorithm, 'none');
  assert.equal(decoded.header.typ, 'JWT');
  assert.equal(decoded.payload.sub, 'operator');
  assert.equal(decoded.signed, false);
});

test('hashing and hash identification work', () => {
  assert.equal(hashText('abc', 'md5'), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(identifyHash('900150983cd24fb0d6963f7d28e17f72'), 'md5 (or ntlm)');
  assert.equal(identifyHash('a'.repeat(64)), 'sha256');
  assert.equal(identifyHash('not-a-hash'), null);
});

test('artifact analysis extracts indicators and detects encodings', () => {
  const artifact = [
    'target 10.20.0.33 and updates.rabbit.lab',
    'flag HC{ghost_in_the_shell}',
    'token d2VsY29tZV9ob21l',
    'hex 68656c6c6f',
    'url hello%20world',
  ].join('\n');
  const analysis = analyzeText(artifact);
  assert.deepEqual(analysis.flags, ['HC{ghost_in_the_shell}']);
  assert.ok(analysis.ips.includes('10.20.0.33'));
  assert.ok(analysis.domains.includes('updates.rabbit.lab'));
  const schemes = analysis.encodings.map((entry) => entry.scheme);
  assert.ok(schemes.includes('base64'));
  assert.ok(schemes.includes('hex'));
  assert.ok(schemes.includes('url'));
  const base64Entry = analysis.encodings.find((entry) => entry.scheme === 'base64');
  assert.equal(base64Entry.decoded, 'welcome_home');
});

test('artifact analysis handles plain text without indicators', () => {
  const analysis = analyzeText('just some ordinary words');
  assert.deepEqual(analysis.domains, []);
  assert.deepEqual(analysis.ips, []);
  assert.deepEqual(analysis.flags, []);
});
