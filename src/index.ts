import { Model, Plugin, Provider } from "@opencode/plugin"
import { Money } from "@opencode/schema/money"

const PROVIDER_ID = "edenai"
const DEFAULT_CATALOG_URL = "https://api.eu.edenai.run/v3/models?view=models"
const DEFAULT_API_URL = "https://api.eu.edenai.run/v3"
const PROVIDER_PACKAGE = "@opencode/ai/providers/openai-compatible"
const FETCH_TIMEOUT_MS = 15_000

type EdenModel = {
  id: string
  model_name?: string | null
  owned_by?: string | null
  created?: number | null
  context_length?: number | null
  capabilities?: Record<string, unknown> | null
  pricing?: Record<string, unknown> | null
  list_pricing?: Record<string, unknown> | null
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function perMillionTokens(value: unknown) {
  const price = finiteNumber(value)
  return price === undefined ? undefined : Money.USDPerMillionTokens.make(price * 1_000_000)
}

function modalities(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function modelCost(item: EdenModel, existing?: Model.Info): Model.Info["cost"] {
  const pricing = item.pricing ?? item.list_pricing ?? {}
  const existingBase = existing?.cost.find((cost) => cost.tier === undefined)
  const existingOver200K = existing?.cost.find(
    (cost) => cost.tier?.type === "context" && cost.tier.size === 200_000,
  )
  const input =
    perMillionTokens(pricing.input_cost_per_token) ?? existingBase?.input ?? Money.USDPerMillionTokens.zero
  const output =
    perMillionTokens(pricing.output_cost_per_token) ?? existingBase?.output ?? Money.USDPerMillionTokens.zero
  const cacheRead =
    perMillionTokens(pricing.cache_read_input_token_cost) ??
    existingBase?.cache.read ??
    Money.USDPerMillionTokens.zero
  const cacheWrite =
    perMillionTokens(pricing.cache_creation_input_token_cost) ??
    existingBase?.cache.write ??
    Money.USDPerMillionTokens.zero
  const over200KInput = perMillionTokens(pricing.input_cost_per_token_above_200k_tokens)
  const over200KOutput = perMillionTokens(pricing.output_cost_per_token_above_200k_tokens)

  const base = Model.Cost.make({
    input,
    output,
    cache: { read: cacheRead, write: cacheWrite },
  })
  const over200K =
    over200KInput !== undefined && over200KOutput !== undefined
      ? Model.Cost.make({
          tier: { type: "context" as const, size: 200_000 },
          input: over200KInput,
          output: over200KOutput,
          cache: {
            read: perMillionTokens(pricing.cache_read_input_token_cost_above_200k_tokens) ?? cacheRead,
            write:
              perMillionTokens(pricing.cache_creation_input_token_cost_above_200k_tokens) ?? cacheWrite,
          },
        })
      : existingOver200K

  return over200K ? [base, over200K] : [base]
}

function toModel(item: EdenModel, providerID: Provider.ID, existing?: Model.Info): Model.Info {
  const id = Model.ID.make(item.id)
  const defaults = Model.Info.default(providerID, id)
  const capabilities = item.capabilities ?? {}
  const input = modalities(capabilities.input_modalities)
  const output = modalities(capabilities.output_modalities)
  const context = finiteNumber(item.context_length) ?? existing?.limit.context ?? 128_000
  const defaultOutput = Math.min(16_384, Math.max(4_096, Math.floor(context / 8)))
  const toolsReported =
    capabilities.supports_function_calling !== undefined || capabilities.supports_tool_choice !== undefined
  const supportsTools =
    capabilities.supports_function_calling === true || capabilities.supports_tool_choice === true
  const created = finiteNumber(item.created)
  const family = nonEmptyString(item.owned_by)

  return {
    ...defaults,
    id,
    modelID: id,
    providerID,
    name: existing?.name ?? nonEmptyString(item.model_name) ?? item.id,
    family: existing?.family ?? (family ? Model.Family.make(family) : undefined),
    capabilities: {
      tools: toolsReported ? supportsTools : (existing?.capabilities.tools ?? defaults.capabilities.tools),
      input: input.length > 0 ? input : (existing?.capabilities.input ?? defaults.capabilities.input),
      output: output.length > 0 ? output : (existing?.capabilities.output ?? defaults.capabilities.output),
    },
    variants: existing?.variants ?? defaults.variants,
    time: {
      released: created !== undefined && created > 0 ? created * 1_000 : (existing?.time.released ?? 0),
    },
    cost: modelCost(item, existing),
    status: existing?.status ?? "active",
    enabled: existing?.enabled ?? true,
    limit: {
      context,
      input: existing?.limit.input,
      output: existing?.limit.output ?? defaultOutput,
    },
    settings: existing?.settings,
    headers: existing?.headers,
    body: existing?.body,
    compatibility: existing?.compatibility,
    package: existing?.package,
  }
}

async function fetchCatalog(catalogURL: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(catalogURL, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const body = (await response.json()) as { data?: unknown }
    if (!Array.isArray(body.data)) throw new Error("response does not contain a model list")

    return body.data.filter(
      (item): item is EdenModel =>
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        typeof item.id === "string" &&
        item.id.length > 0,
    )
  } finally {
    clearTimeout(timeout)
  }
}

export default Plugin.define({
  id: "edenai-eu-catalog",
  async setup(ctx) {
    const catalogURL = nonEmptyString(ctx.options.catalogURL) ?? DEFAULT_CATALOG_URL
    const configuredAPIURL = nonEmptyString(ctx.options.baseURL)
    const includeNonToolModels = ctx.options.includeNonToolModels === true

    let catalog: EdenModel[]
    try {
      catalog = await fetchCatalog(catalogURL)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[edenai-eu-catalog] ${message}; keeping the configured Eden AI catalog`)
      return
    }

    await ctx.provider.transform((editor) => {
      const providerID = Provider.ID.make(PROVIDER_ID)
      const existing = editor.get(PROVIDER_ID)
      const existingBaseURL = nonEmptyString(existing?.provider.settings?.baseURL)
      const apiURL = configuredAPIURL ?? existingBaseURL ?? DEFAULT_API_URL
      const models = catalog
        .filter((item) => {
          const capabilities = item.capabilities ?? {}
          const input = modalities(capabilities.input_modalities)
          const output = modalities(capabilities.output_modalities)
          const supportsTools =
            capabilities.supports_function_calling === true || capabilities.supports_tool_choice === true
          return input.includes("text") && output.includes("text") && (includeNonToolModels || supportsTools)
        })
        .map((item) => toModel(item, providerID, existing?.models.get(item.id)))

      if (existing) {
        editor.update(PROVIDER_ID, (provider) => {
          provider.name = provider.name || "Eden AI EU"
          provider.activation = "enabled"
          provider.package = provider.package || PROVIDER_PACKAGE
          provider.settings = { ...provider.settings, baseURL: apiURL }
        })
        editor.models.set(PROVIDER_ID, models)
        return
      }

      editor.add({
        info: {
          ...Provider.Info.empty(providerID),
          name: "Eden AI EU",
          activation: "enabled",
          package: PROVIDER_PACKAGE,
          settings: { baseURL: apiURL },
        },
        models,
      })
    })
  },
})
