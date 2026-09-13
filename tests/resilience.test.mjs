import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const store = await readFile(new URL('../src/store.js', import.meta.url), 'utf8');
const client = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('a failed mutation rejects its caller without blocking the next operation', async () => {
  const source = store.slice(store.indexOf('export async function mutateStore'), store.indexOf('async function getPool')).replace('export ', '');
  let writes = 0;
  const context = vm.createContext({ readStore: async () => ({}), writeStore: async () => { if (++writes === 1) throw new Error('database unavailable'); } });
  vm.runInContext(`let mutationQueue = Promise.resolve(); ${source}`, context);
  await assert.rejects(context.mutateStore(async () => ({ ok: true })), /database unavailable/);
  assert.equal((await context.mutateStore(async () => ({ ok: true }))).ok, true);
  assert.equal(writes, 2);
});

test('timeout also stops a response whose JSON body never arrives', async () => {
  const source = client.slice(client.indexOf('async function fetchWithTimeout'), client.indexOf('async function apiFetch'));
  const context = vm.createContext({ AbortController, setTimeout: (fn) => setTimeout(fn, 15), clearTimeout, fetch: async (_url, options) => ({ ok: true, status: 200, json: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))) }) });
  vm.runInContext(source, context);
  await assert.rejects(context.fetchWithTimeout('/api/courses'), /aborted/);
});

test('failed course loading displays a retry instead of no available lessons', () => {
  const source = client.slice(client.indexOf('function renderCourseLoadState'), client.indexOf('function renderCourses'));
  let handler;
  let retried = false;
  const context = vm.createContext({ loadCourses: () => { retried = true; } });
  vm.runInContext(`let coursesLoadState = 'error'; ${source}`, context);
  const container = { innerHTML: '', querySelector: () => ({ addEventListener: (_event, fn) => { handler = fn; } }) };
  assert.equal(context.renderCourseLoadState(container), true);
  assert.match(container.innerHTML, /Impossibile caricare/);
  handler();
  assert.equal(retried, true);
});
