import test from 'node:test';
import assert from 'node:assert/strict';
import { parseActorInput } from '../src/actor-input.ts';
import { buildCatalog } from '../server/catalog.mjs';
import { normalizeInput } from '../server/input.mjs';

test('every scraper has input definitions and honest documentation, without copied marketplace statistics', () => {
  const actors = buildCatalog();
  assert.equal(actors.length,22);
  for(const actor of actors) {
    assert.ok(actor.documentation.overview);
    assert.ok(actor.documentation.output.some(f=>f.name==='sourceUrl'));
    assert.ok(actor.documentation.output.some(f=>f.name==='collectedAt'));
    assert.ok(actor.documentation.limitations.length);
    assert.equal(actor.slug,`leeds/${actor.id}`);
    assert.equal(actor.rating,undefined);
  }
  for(const id of ['google-maps-scraper','google-search-scraper','ai-extract'])
    assert.equal(actors.find(a=>a.id===id).status,'requires-provider');
  const configured = buildCatalog({llmConfigured:true,googleMapsConfigured:true,googleSearchConfigured:true});
  assert.ok(configured.every(a=>['ready','access-limited'].includes(a.status)));
  assert.equal(actors.filter(a=>a.status==='access-limited').length,6);
});

test('JSON input preserves URL commas and rejects lossy types or unknown fields', () => {
  const actor=buildCatalog().find(a=>a.id==='website-content');
  const input={urls:['https://example.com/a,b'],maxPages:2,respectRobots:false};
  assert.deepEqual(parseActorInput(JSON.stringify(input),actor.fields),input);
  for(const input of ['{','[]','null','{"extra":true}','{"urls":"https://example.com"}','{"urls":[1]}','{"maxPages":"2"}','{"respectRobots":"false"}'])
    assert.throws(()=>parseActorInput(input,actor.fields));
  const local=buildCatalog().find(a=>a.id==='local-business-leads');
  assert.throws(()=>parseActorInput('{"category":"unsupported"}',local.fields));
  assert.deepEqual(parseActorInput('{}',actor.fields),{});
});

test('YouTube input requires URLs or query and Google Search requires a query', () => {
  const actors=buildCatalog();
  assert.throws(()=>normalizeInput(actors.find(a=>a.id==='youtube-scraper'),{}),/URLs or a search query/);
  assert.equal(normalizeInput(actors.find(a=>a.id==='youtube-scraper'),{query:'Nepal business'}).query,'Nepal business');
  assert.equal(normalizeInput(actors.find(a=>a.id==='youtube-scraper'),{urls:[],query:'lofi'}).urls,undefined);
  assert.throws(()=>normalizeInput(actors.find(a=>a.id==='google-search-scraper'),{}),/required/);
});
