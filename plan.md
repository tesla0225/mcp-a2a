# 複数エージェント対応計画

## 1. 環境変数の形式変更

### 現在の形式
```bash
A2A_ENDPOINT_URL=http://localhost:41241
```

### 新しい形式
```bash
A2A_ENDPOINT_URLS=http://localhost:41241,http://localhost:41242,http://localhost:41243
```

## 2. 実装コード

### 設定管理クラス
```typescript
// config.ts
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
```

### エージェントマネージャー
```typescript
// agent-manager.ts
export class AgentManager {
  private clients: Map<string, A2AClient>;
  private config: AgentConfig;

  constructor() {
    this.clients = new Map();
    this.config = new AgentConfig();
    this.initializeClients();
  }

  private async initializeClients(): Promise<void> {
    const endpoints = this.config.getEndpoints();
    
    for (const endpoint of endpoints) {
      try {
        const client = new A2AClient(endpoint.url);
        // 接続テスト
        await client.agentCard();
        this.clients.set(endpoint.id, client);
        console.log(`Successfully connected to agent ${endpoint.id} at ${endpoint.url}`);
      } catch (error) {
        console.error(`Failed to connect to agent ${endpoint.id} at ${endpoint.url}:`, error);
      }
    }
  }

  getClient(agentId: string): A2AClient | undefined {
    return this.clients.get(agentId);
  }

  getClientByUrl(url: string): A2AClient | undefined {
    const endpoint = this.config.getEndpointByUrl(url);
    return endpoint ? this.clients.get(endpoint.id) : undefined;
  }

  getAllClients(): Map<string, A2AClient> {
    return this.clients;
  }

  async sendTask(agentId: string, params: TaskSendParams): Promise<Task | null> {
    const client = this.getClient(agentId);
    if (!client) {
      throw new Error(`Agent ${agentId} not found`);
    }
    return client.sendTask(params);
  }
}
```

### メインサーバーの修正
```typescript
// index.ts
const agentManager = new AgentManager();

// ツールハンドラーの修正
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "a2a_send_task": {
        const { message, taskId, agentId } = args as { 
          message: string; 
          taskId?: string;
          agentId?: string;
        };
        
        if (!agentId) {
          throw new Error('agentId is required');
        }
        
        const result = await agentManager.sendTask(agentId, {
          id: taskId || crypto.randomUUID(),
          message: {
            role: "user",
            parts: [{ text: message }],
          },
        });
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
      // 他のケースも同様に修正
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
});
```

## 3. 使用方法

### 環境変数の設定例
```bash
export A2A_ENDPOINT_URLS="http://localhost:41241,http://localhost:41242"
```

### タスクの送信例
```typescript
// エージェントのIDを取得
const endpoints = agentManager.getAllClients();
const agentId = Array.from(endpoints.keys())[0]; // 最初のエージェントのIDを使用

// タスクを送信
await agentManager.sendTask(agentId, {
  id: 'task-123',
  message: {
    role: "user",
    parts: [{ text: "Hello Agent" }],
  },
});
```

## 4. 注意点

1. **UUIDの使用**
   - すべてのエージェントに一意のUUIDが割り当てられる
   - エージェントのIDは起動時に自動生成される

2. **エラー処理**
   - 接続失敗時の適切なエラーハンドリング
   - エージェントが見つからない場合のエラーメッセージ
   - agentIdが指定されていない場合のエラー

3. **設定の検証**
   - 環境変数の形式チェック
   - URLの形式チェック

4. **ログ出力**
   - 接続状態のログ（UUIDとURLの両方を表示）
   - エラー発生時の詳細なログ 