import { randomUUID } from 'crypto';

export interface AgentEndpoint {
  id: string;  // UUID
  url: string;
}

export class AgentConfig {
  private endpoints: AgentEndpoint[] = [];

  constructor() {
    this.loadEndpoints();
  }

  private loadEndpoints(): void {
    const endpointsStr = process.env.A2A_ENDPOINT_URLS;
    if (!endpointsStr) {
      // 後方互換性のため、単一のエンドポイントもサポート
      const singleEndpoint = process.env.A2A_ENDPOINT_URL;
      if (singleEndpoint) {
        this.endpoints = [{
          id: randomUUID(),
          url: singleEndpoint
        }];
      }
      return;
    }

    try {
      this.endpoints = endpointsStr.split(',').map(url => ({
        id: randomUUID(),
        url: url.trim()
      }));
    } catch (error) {
      console.error('Failed to parse A2A_ENDPOINT_URLS:', error);
      this.endpoints = [];
    }
  }

  getEndpoints(): AgentEndpoint[] {
    return this.endpoints;
  }

  getEndpointById(id: string): AgentEndpoint | undefined {
    return this.endpoints.find(endpoint => endpoint.id === id);
  }

  getEndpointByUrl(url: string): AgentEndpoint | undefined {
    return this.endpoints.find(endpoint => endpoint.url === url);
  }
} 