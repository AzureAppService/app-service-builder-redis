# Configure PulseBoard with CLI or ARM

Run from your fork's root with explicit subscription, a dedicated DEV/TEST group and approved B0 capacity/prices.
Use README section 1's `infra/main.bicep` to create the cache/database.
Never substitute a larger SKU or weaken an existing cache network policy.

## Create the app and restricted data policy

Set `SUBSCRIPTION`, `RG`, unique new `APP`, `CACHE` and `NAMESPACE=demo`.

```bash
az deployment group create --subscription "$SUBSCRIPTION" -g "$RG" \
  --name pulseboard-app --template-file infra/app.bicep \
  --parameters appName="$APP" namespace="$NAMESPACE"
az rest --method get --url "https://management.azure.com/subscriptions/$SUBSCRIPTION/resourceGroups/$RG/providers/Microsoft.Web/builderApps/$APP?api-version=2026-09-01-preview" \
  --query '{identity:identity,identityUpdate:properties.identityUpdate}'
```

Wait for committed identity and no pending operation (`builder app status`), then grant its principal—not client ID:
With ARM-only tooling, GET the app ARM URL below and inspect `identity` and `properties.identityUpdate` instead.

```bash
PRINCIPAL="<committed-app-principal-id>"
az deployment group create --subscription "$SUBSCRIPTION" -g "$RG" \
  --name pulseboard-access --template-file infra/access.bicep \
  --parameters cacheName="$CACHE" principalId="$PRINCIPAL" \
    assignmentName=pulseboard-app namespace="$NAMESPACE"
```

Do not overwrite an unrelated policy assignment. Configure required visitor access before deploying this write-capable UI.
Copy root `connection.json` into private, ignored `.local/connection.json`.
Prepare it with `umask 077; mkdir -p .local; cp connection.json .local/connection.json`.
Fill resource ID/actual host; keep port 10000/TLS true and empty generated username value. Keep only namespace/auth mode as app controls.
Remove legacy `REDIS_ENDPOINT` without deploying if migrating an existing app.

## Add with native Builder CLI

Requires a release with `builder app connections --help`; older archives use ARM below.

```bash
builder login
builder app connections list --name "$APP" -s "$SUBSCRIPTION" -g "$RG" --json
builder app connections add --name "$APP" -s "$SUBSCRIPTION" -g "$RG" --connection-json '@.local/connection.json'
builder app connections status --name "$APP" -s "$SUBSCRIPTION" -g "$RG" --connection-name cache
```

Do not use Azure-role `--grant-access`; Redis requires its data policy.
`update --connection-json` replaces one complete object; `remove --connection-name cache` changes pending configuration only.
Managed Redis requires managed identity here, not password/key authentication.

## Add with ARM instead

Use Bash/`jq`; `.local/` must remain private and uncommitted.

```bash
APP_ARM="https://management.azure.com/subscriptions/$SUBSCRIPTION/resourceGroups/$RG/providers/Microsoft.Web/builderApps/$APP"
APP_URL="$APP_ARM?api-version=2026-09-01-preview"
az rest --method get --url "$APP_URL" > .local/app.json
ETAG="$(jq -er .etag .local/app.json)"
jq --slurpfile next .local/connection.json '
  {properties:{versionConfiguration:{connections:
    ((.properties.versionConfiguration.connections // [] |
      map(select((.name|ascii_downcase) != ($next[0].name|ascii_downcase)))) + $next)}}}
' .local/app.json > .local/update.json
az rest --method patch --url "$APP_URL" --headers "If-Match=$ETAG" --body @.local/update.json
az rest --method get --url "$APP_URL" --query properties.versionConfiguration.connections
```

Refresh/reconcile on 412; the complete list preserves unrelated connections and omits manual values/source/scaling.
Do not manufacture the generated Redis principal value or global `AZURE_CLIENT_ID`.

## Deploy and verify

Use connected GitHub source, or `git archive --format=zip --output=../pulseboard-source.zip HEAD` followed by `builder app deploy --name "$APP" -s "$SUBSCRIPTION" -g "$RG" --source-archive ../pulseboard-source.zip --manifest ./builder.yaml --json`.
Deploy current desired configuration, not a retained version; wait for success.
Verify real Redis ping, counter/leaderboard/cache writes and expiry through the README checks.
Token refresh and the sample's selected-principal check remain in force; diagram status alone proves no access.
