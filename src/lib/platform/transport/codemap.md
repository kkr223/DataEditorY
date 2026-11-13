# src/lib/platform/transport/

## Responsibility

Document host transport boundary. CDB data operations are expressed as JSON requests and routed either to Tauri `invoke` (desktop) or a Web Worker (web build). UI code and modules depend on the interface, never on the concrete transport.

## Modules

| File | Purpose |
|------|---------|
| `types.ts` | `DocumentHostTransport` plus wire request/response shapes for open/query/execute/save/undo/close |
| `provider.ts` | `DocumentHostProvider` — adapts a transport to `DataProvider` for the CDB module |
| `tauri.ts` | Tauri implementation using `invokeCommand` |

## Rules

- Request shapes must stay identical to `src-tauri/src/document_host/models.rs`.
- `DocumentHostProvider.save` is the only CDB write path; the codec's `encode` is a guard and is never called by the runtime when the provider supports saving.
- A web transport is added in `src/lib/platform/transport/worker.ts` during the web port; both implementations must pass the same protocol tests.
