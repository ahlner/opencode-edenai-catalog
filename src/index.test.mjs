import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import plugin from './index.ts'
import { Model, Provider } from '@opencode/plugin'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

function model(id, options = {}) {
  return {
    id,
    pricing_endpoint: options.pricing_endpoint,
    capabilities: {
      input_modalities: ['text'],
      output_modalities: ['text'],
      supports_function_calling: true,
      ...options.capabilities,
    },
    pricing: options.pricing,
  }
}

async function setup(items, options = {}, existing) {
  const calls = []
  const state = { provider: existing?.provider, models: existing?.models ?? new Map() }
  const editor = {
    get: () => state.provider ? state : undefined,
    update: (_id, change) => change(state.provider),
    add: ({ info, models }) => { state.provider = info; state.models = new Map(models.map((item) => [item.id, item])) },
    models: { set: (_id, models) => { state.models = new Map(models.map((item) => [item.id, item])) } },
  }
  globalThis.fetch = async (url) => {
    calls.push(url)
    return { ok: true, json: async () => ({ data: items }) }
  }
  await plugin.setup({ options, provider: { transform: async (callback) => callback(editor) } })
  return { calls, state }
}

test('uses the provider-independent catalog URL and sends its model ID', async () => {
  const { calls, state } = await setup([model('glm-5.3-flash', { pricing_endpoint: 'greenpt/glm-5.3-flash' })])
  assert.deepEqual(calls, ['https://api.eu.edenai.run/v3/models?view=models'])
  assert.equal(state.provider.settings.baseURL, 'https://api.eu.edenai.run/v3')
  assert.equal(state.models.get('glm-5.3-flash').modelID, 'glm-5.3-flash')
  assert.equal(state.models.get('glm-5.3-flash').providerID, 'edenai')
})

test('honors an explicit catalog URL and existing API URL', async () => {
  const existing = { provider: { name: 'Existing', settings: { baseURL: 'https://example.test/v3' } }, models: new Map() }
  const { calls, state } = await setup([model('glm-5.3-flash')], { catalogURL: 'https://example.test/catalog' }, existing)
  assert.deepEqual(calls, ['https://example.test/catalog'])
  assert.equal(state.provider.settings.baseURL, 'https://example.test/v3')
})

test('preserves the configured provider when the catalog request fails', async () => {
  const previous = model('previous')
  const existing = { provider: { name: 'Existing', settings: { baseURL: 'https://example.test/v3' } }, models: new Map([['previous', previous]]) }
  globalThis.fetch = async () => ({ ok: false, status: 503 })
  const warning = console.warn
  console.warn = () => {}
  try {
    await plugin.setup({ options: {}, provider: { transform: async () => { throw Error('unexpected transform') } } })
  } finally { console.warn = warning }
  assert.equal(existing.models.get('previous'), previous)
})

test('filters non-text and non-tool models unless configured otherwise', async () => {
  const items = [
    model('tools'),
    model('no-tools', { capabilities: { supports_function_calling: false } }),
    model('image-only', { capabilities: { input_modalities: ['image'] } }),
  ]
  const standard = await setup(items)
  assert.deepEqual([...standard.state.models.keys()], ['tools'])
  const all = await setup(items, { includeNonToolModels: true })
  assert.deepEqual([...all.state.models.keys()], ['tools', 'no-tools'])
})

test('converts catalog prices per token to USD per million tokens', async () => {
  const { state } = await setup([model('priced', { pricing: {
    input_cost_per_token: 0.000001,
    output_cost_per_token: 0.000004,
    cache_read_input_token_cost: 0.0000002,
    cache_creation_input_token_cost: 0.0000012,
  } })])
  const cost = state.models.get('priced').cost[0]
  assert.equal(cost.input, 1)
  assert.equal(cost.output, 4)
  assert.ok(Math.abs(cost.cache.read - 0.2) < 1e-12)
  assert.ok(Math.abs(cost.cache.write - 1.2) < 1e-12)
})

test('replaces an old endpoint model ID with the provider-independent API ID', async () => {
  const existingModel = {
    ...Model.Info.default(Provider.ID.make('edenai'), Model.ID.make('glm-5.3-flash')),
    name: 'Custom name',
    modelID: 'greenpt/glm-5.3-flash',
  }
  const existing = { provider: { name: 'Existing', settings: {} }, models: new Map([['glm-5.3-flash', existingModel]]) }
  const { state } = await setup([model('glm-5.3-flash')], {}, existing)
  assert.equal(state.models.get('glm-5.3-flash').modelID, 'glm-5.3-flash')
  assert.equal(state.models.get('glm-5.3-flash').name, 'Custom name')
})
