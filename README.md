# @ahlner/opencode-edenai-catalog

This OpenCode V2 plugin adds the current model catalog to the `edenai` provider for the Eden AI EU region.
The catalog contains models, capabilities, context limits, and prices.
The plugin replaces the static model configuration with data from `/v3/models`.

## Installation

Use OpenCode V2.
The plugin was tested with OpenCode 2.0.x.

Choose one installation method.

### Install from npm (recommended)

Run this command:

```sh
opencode plugin add @ahlner/opencode-edenai-catalog
```

### Install from this repository

Use a version tag.
Run this command:

```sh
opencode plugin add 'github:ahlner/opencode-edenai-catalog#v1.0.0'
```

### Install through the configuration file

Add this entry to the global configuration file at `~/.config/opencode/opencode.json`:

```jsonc
{
  "plugins": [
    "@ahlner/opencode-edenai-catalog"
  ]
}
```

OpenCode automatically installs the package and its dependencies in `~/.cache/opencode/packages/`.
For Git installations, OpenCode keeps the exact tag or commit hash.

To update a Git installation:

1. Select a new version tag.
2. Run `opencode plugin add` with that tag, or change the tag in the configuration file.

## Configuration

Use the object form to specify options:

```jsonc
{
  "plugins": [
    {
      "package": "github:ahlner/opencode-edenai-catalog#v1.0.0",
      "options": {
        "catalogURL": "https://api.eu.edenai.run/v3/models",
        "baseURL": "https://api.eu.edenai.run/v3",
        "includeNonToolModels": false
      }
    }
  ]
}
```

| Option | Default | Description |
| --- | --- | --- |
| `catalogURL` | `https://api.eu.edenai.run/v3/models` | The URL of the model catalog. |
| `baseURL` | `https://api.eu.edenai.run/v3` | The base URL for the provider API. This option overrides an existing `baseURL` configuration. |
| `includeNonToolModels` | `false` | Include models without function calling. |

Configure the API key through `provider.edenai.options.apiKey` or the authentication settings in OpenCode.
This plugin does not configure the API key.

## Behavior

- The plugin retrieves the catalog when the plugin starts. The request has a timeout of 15 seconds.
- The plugin registers or updates the `edenai` provider through `ctx.provider.transform`. It uses the `openai-compatible` driver package.
- By default, the plugin includes only text models that support function calling.
- The plugin reads prices from `pricing` or `list_pricing`. It expresses prices in USD per million tokens.
- Models with `*_above_200k_tokens` prices receive a second cost tier.
- If the catalog request fails, the plugin keeps the static Eden AI configuration in OpenCode unchanged.
  Failures include network errors, HTTP errors, and timeouts.
  The plugin writes a warning to the log instead of a fatal error.

## License

The project uses the MIT license.
Read [LICENSE](./LICENSE) for the legal terms.

## Development

### Project structure

```
opencode-edenai-catalog/
├── AGENTS.md         # Rules for project documentation
├── package.json      # Package manifest with direct TypeScript exports
├── src/index.ts      # Plugin code
└── README.md         # Project documentation
```

The package exports the TypeScript source directly.
It does not require a build step.

### Local test

Add the repository path to `opencode.json` or `opencode.jsonc`:

```jsonc
{ "plugins": ["./relative/path/to/opencode-edenai-catalog"] }
```

If OpenCode does not monitor a dependency, you may need to restart the service after changes to that dependency.
If necessary, run this command:

```sh
opencode service restart
```

## Technical terms

| Term | Meaning |
| --- | --- |
| API | An interface that software uses to exchange requests and responses. |
| Capability | A function or input or output type that a model supports. |
| Context limit | The maximum number of tokens in a model context. |
| Cost tier | A set of prices for a specified context size. |
| Function calling | A model capability that lets the model request a tool operation. |
| Model catalog | A list of models and their properties. |
| Provider | The OpenCode component that gives access to models from an API service. |
| Token | A unit that a model uses to process input or output. |

## Documentation rules

Write and maintain project documentation in Simplified Technical English.
Follow the rules in [AGENTS.md](./AGENTS.md).
These rules apply the writing principles of ASD-STE100.
They do not certify compliance with the official ASD dictionary.
Keep the MIT license text unchanged.
