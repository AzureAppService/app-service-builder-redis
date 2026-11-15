targetScope = 'resourceGroup'

@description('Unique name for a new source-less Builder App; do not rerun over a configured app.')
param appName string
@allowed(['westus2'])
param location string = 'westus2'
@minLength(1)
@maxLength(40)
param namespace string = 'demo'

resource app 'Microsoft.Web/builderApps@2026-09-01-preview' = {
  name: appName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    versionConfiguration: {
      variables: [
        { name: 'REDIS_NAMESPACE', value: namespace }
        { name: 'REDIS_AUTH_MODE', value: 'managed-identity' }
      ]
    }
    scaling: {
      components: [
        { name: 'api', minReplicas: 0, maxReplicas: 2, httpEnabled: true }
      ]
    }
  }
}

output appResourceId string = app.id
output principalId string = app.identity.principalId
