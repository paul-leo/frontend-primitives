export interface ScopeCommsTransport {
  publish(raw: string): void
  subscribe(handler: (raw: string) => void): () => void
  dispose?(): void
}
