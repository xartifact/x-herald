export type ReplayBodySelection =
  | { kind: 'transformed'; body: unknown }
  | { kind: 'original'; body: unknown }
  | { kind: 'error'; message: string }

export interface ReplayBodySelectionInput {
  transformedRequestBody: unknown | null
  requestBody: unknown | null
  incomingProtocol: string | null
  targetProtocol: string | null
}

export function selectReplayBody(input: ReplayBodySelectionInput): ReplayBodySelection {
  if (input.transformedRequestBody !== null && input.transformedRequestBody !== undefined) {
    return { kind: 'transformed', body: input.transformedRequestBody }
  }

  if (
    input.incomingProtocol === null ||
    input.targetProtocol === null ||
    input.incomingProtocol !== input.targetProtocol
  ) {
    return {
      kind: 'error',
      message:
        'transformed_request_body is missing and the ingress/egress protocols do not prove same-protocol passthrough; use a request attempt with a stored provider body or verify the log protocol fields.',
    }
  }

  if (input.requestBody === null || input.requestBody === undefined) {
    return {
      kind: 'error',
      message:
        'transformed_request_body is missing for same-protocol passthrough, but request_logs.request_body is also unavailable.',
    }
  }

  return { kind: 'original', body: input.requestBody }
}
