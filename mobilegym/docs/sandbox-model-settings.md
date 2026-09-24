# Sandbox model settings

The browser-level console groups tools into three initially collapsed sections:
Model settings, Finance testing, and Chat/data. Native disclosure controls keep
only one section open at a time. Simulated apps are unchanged.

Model settings apply to both Zhiyin's steward and WeChat's simulated contacts.
Saving updates the next model request immediately; in-flight requests retain
their original configuration. Saving itself does not make a paid model request.

The form edits the HTTPS API base URL and model name. Its password field is
always empty when loaded. An empty key preserves the existing key; changing the
provider origin requires a replacement key. Keys are never returned by GET or
POST responses and are not written to browser storage.

The server writes `.sandbox-model.local.json` atomically with owner-only `0600`
permissions. This ignored private file overrides the existing
`WECHAT_CONTACT_CHAT_*` environment defaults. It must not be committed or copied
to public assets. Vite's filesystem deny rules block both the private file and
its temporary files. Corrupt private configuration fails closed.

`/api/sandbox/model-config` permits only loopback clients using a localhost Host
and same-origin requests. Writes additionally require JSON and a custom header.
Configuration from a remote LAN phone is intentionally unavailable; use the
host computer's localhost console. The simulated mobile view works normally.

This interface is a local development tool, not a multi-user administration API.
Do not expose the dev server or management endpoint publicly. Shared deployment
requires authenticated administrative access and a dedicated secret store.
