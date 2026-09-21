/**
 * Minimal example plugin: logs every request and response.
 *
 * Exists to prove the plugin contract end to end — that a manifest can name a
 * module, the module's default export is accepted, `onInit` receives a usable
 * context, and the request/response hooks actually run in the request path.
 * It is deliberately trivial: anything more would obscure whether a failure came
 * from the plugin or from the loader.
 *
 * @module plugins/logger-plugin
 */

import type { Plugin } from '@xartifact/x-herald-shared'

/** Counters exposed on the plugin so a test can assert the hooks ran. */
interface Counters {
  requests: number
  responses: number
  shutdowns: number
}

/**
 * The plugin instance.
 *
 * `name` must match its `plugin.json`, or the loader refuses it — the manifest
 * and the code have to agree on identity for logs to be trustworthy.
 */
const plugin: Plugin & { counters: Counters } = {
  name: 'logger-plugin',
  version: '0.0.1',

  counters: { requests: 0, responses: 0, shutdowns: 0 },

  async onInit(ctx) {
    ctx.logger.info('logger-plugin initialized', { gatewayVersion: ctx.gatewayVersion })
    // Routes are contributed through the context, never by importing the router:
    // that is what lets the host own the mount point and unload the plugin.
    ctx.registerRoute({
      path: '/plugins/logger-plugin/status',
      handler: () =>
        Response.json({
          plugin: plugin.name,
          version: plugin.version,
          counters: plugin.counters,
        }),
    })
  },

  async onRequest(request) {
    plugin.counters.requests += 1
    // Returning the request unchanged is the point: an observing plugin must not
    // perturb traffic.
    return request
  },

  async onResponse(response) {
    plugin.counters.responses += 1
    return response
  },

  async onShutdown() {
    plugin.counters.shutdowns += 1
  },
}

export default plugin
