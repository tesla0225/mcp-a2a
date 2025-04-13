import { A2AClient } from './a2a-client.js';
import { AgentConfig, AgentEndpoint } from './config.js';

export class AgentManager {
  private clients: Map<string, A2AClient>;
  private config: AgentConfig;

  constructor() {
    this.clients = new Map();
    this.config = new AgentConfig();
  }

  async initialize(): Promise<void> {
    const endpoints = this.config.getEndpoints();
    
    for (const endpoint of endpoints) {
      try {
        const client = new A2AClient(endpoint.url);
        // 接続テスト
        await client.agentCard();
        this.clients.set(endpoint.id, client);
        console.error(`Successfully connected to agent ${endpoint.id} at ${endpoint.url}`);
      } catch (error) {
        console.error(`Failed to connect to agent ${endpoint.id} at ${endpoint.url}:`, error);
      }
    }
  }

  getClientById(id: string): A2AClient | undefined {
    return this.clients.get(id);
  }

  getAllClients(): Map<string, A2AClient> {
    return this.clients;
  }

  getEndpoints(): AgentEndpoint[] {
    return this.config.getEndpoints();
  }
} 