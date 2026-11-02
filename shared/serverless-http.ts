import type { IncomingMessage, ServerResponse } from 'node:http'

// The Node serverless runtime supplies these helpers. Keep this boundary limited
// to the API used by our handlers; no build SDK is needed at runtime or for types.
export interface ApiRequest extends IncomingMessage {
  body: unknown
  query: Record<string, string | string[] | undefined>
}

export interface ApiResponse extends ServerResponse {
  status(code: number): this
  json(body: unknown): this
  send(body: string | Buffer): this
}
