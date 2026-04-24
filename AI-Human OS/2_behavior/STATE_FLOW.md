# State Flow

## Request Lifecycle
states:
- idle
- loading
- success
- error

transitions:
- idle → loading (request sent)
- loading → success (response received)
- loading → error (request failed)

## Sync Lifecycle
states:
- synced
- dirty
- syncing

transitions:
- synced → dirty (local change)
- dirty → syncing (send update)
- syncing → synced (server confirms)