# @ahlner/opencode-edenai-catalog

OpenCode V2 Plugin: erweitert den Provider `edenai` (Eden AI, EU-Region) um den
live abgerufenen Modellkatalog — Modelle, Capabilities, Context-Limits und
Preise. Ersetzt die statische Modellkonfiguration durch echte Daten aus
`/v3/models`.

## Installation

Aus npm (empfohlen):

```sh
opencode plugin add @ahlner/opencode-edenai-catalog
```

oder direkt aus diesem Repo (getaggte Version):

```sh
opencode plugin add 'github:ahlner/opencode-edenai-catalog#v1.0.0'
```

oder deklarativ in der globalen `~/.config/opencode/opencode.json`:

```jsonc
{
  "plugins": [
    "@ahlner/opencode-edenai-catalog"
  ]
}
```

OpenCode installiert das Package samt Abhängigkeiten automatisch nach
`~/.cache/opencode/packages/`. Bei Git-Installationen werden exakte Tags und
Commit-Hashes gepinnt; ein Versions-Update erfordert ein neues Tag + erneutes
`plugin add` bzw. Config-Update.

Voraussetzung: OpenCode V2 (getestet gegen 2.0.x).

## Konfiguration

Optionen über die Objekt-Form:

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

| Option | Default | Beschreibung |
| --- | --- | --- |
| `catalogURL` | `https://api.eu.edenai.run/v3/models` | Endpunkt des Modellkatalogs |
| `baseURL` | `https://api.eu.edenai.run/v3` | API-Basis-URL des Providers (Vorrang vor bereits konfigurierter `baseURL`) |
| `includeNonToolModels` | `false` | Auch Modelle ohne Function-Calling aufnehmen |

Der API-Key selbst wird wie üblich über `provider.edenai.options.apiKey`
bzw. die Auth-Verwaltung von OpenCode konfiguriert — nicht Teil dieses
Plugins.

## Verhalten

- Lädt beim Plugin-Start den Katalog (15 s Timeout) und registriert/aktualisiert
  den `edenai`-Provider via `ctx.provider.transform` mit dem
  `openai-compatible`-Treiberpaket.
- Filtert standardmäßig auf textuelle Modelle mit Function-Calling-Support.
- Preise werden aus `pricing`/`list_pricing` in USD pro Million Tokens
  übernommen; Modelle mit `*_above_200k_tokens`-Preisen erhalten einen
  zweiten Cost-Tier.
- Schlägt der Katalog-Abruf fehl (Netzwerk, HTTP-Fehler, Timeout), bleibt die
  in OpenCode konfigurierte statische Eden-AI-Konfiguration unangetastet —
  es gibt nur eine Warnung im Log, kein harter Fehler.

## Lizenz

MIT — siehe [LICENSE](./LICENSE).

## Entwicklung

Struktur:

```
opencode-edenai-catalog/
├── package.json      # Manifest, exports TS-Source direkt (kein Build-Schritt)
├── src/index.ts      # Plugin-Logik
└── README.md
```

Lokales Testen: Repo-Pfad direkt in `opencode.json(c)` eintragen:

```jsonc
{ "plugins": ["./relative/path/to/opencode-edenai-catalog"] }
```

Nach Änderungen an unwatched dependencies ggf. `opencode service restart`.
