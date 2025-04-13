#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AgentManager } from "./agent-manager.js";

// Create MCP server
const server = new Server(
  {
    name: "a2a-client-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
);

// Create agent manager instance
const agentManager = new AgentManager();

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "a2a_send_task",
      description: "Send a task to an A2A agent",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Message to send to the agent",
          },
          taskId: {
            type: "string",
            description: "Optional task ID. If not provided, a new UUID will be generated",
          },
          agentId: {
            type: "string",
            description: "Optional agent ID. If not provided, the first available agent will be used",
          },
        },
        required: ["message"],
      },
    },
    {
      name: "a2a_get_task",
      description: "Get the current state of a task",
      inputSchema: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "ID of the task to retrieve",
          },
          agentId: {
            type: "string",
            description: "ID of the agent that handled the task",
          },
        },
        required: ["taskId", "agentId"],
      },
    },
    {
      name: "a2a_cancel_task",
      description: "Cancel a running task",
      inputSchema: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "ID of the task to cancel",
          },
          agentId: {
            type: "string",
            description: "ID of the agent that is handling the task",
          },
        },
        required: ["taskId", "agentId"],
      },
    },
    {
      name: "a2a_send_task_subscribe",
      description: "Send a task and subscribe to updates (streaming)",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Message to send to the agent",
          },
          taskId: {
            type: "string",
            description: "Optional task ID. If not provided, a new UUID will be generated",
          },
          agentId: {
            type: "string",
            description: "Optional agent ID. If not provided, the first available agent will be used",
          },
          maxUpdates: {
            type: "number",
            description: "Maximum number of updates to receive (default: 10)",
          },
        },
        required: ["message"],
      },
    },
    {
      name: "a2a_agent_info",
      description: "Get information about the connected A2A agents",
      inputSchema: {
        type: "object",
        properties: {
          agentId: {
            type: "string",
            description: "Optional agent ID. If not provided, information for all agents will be returned",
          },
        },
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "a2a_send_task": {
        const { message, taskId, agentId } = args as { message: string; taskId?: string; agentId?: string };
        const client = agentId ? agentManager.getClientById(agentId) : agentManager.getAllClients().values().next().value;
        
        if (!client) {
          throw new Error(`No available agent${agentId ? ` with ID ${agentId}` : ''}`);
        }

        const result = await client.sendTask({
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

      case "a2a_get_task": {
        const { taskId, agentId } = args as { taskId: string; agentId: string };
        const client = agentManager.getClientById(agentId);
        
        if (!client) {
          throw new Error(`No agent found with ID ${agentId}`);
        }

        const result = await client.getTask({ id: taskId });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "a2a_cancel_task": {
        const { taskId, agentId } = args as { taskId: string; agentId: string };
        const client = agentManager.getClientById(agentId);
        
        if (!client) {
          throw new Error(`No agent found with ID ${agentId}`);
        }

        const result = await client.cancelTask({ id: taskId });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "a2a_send_task_subscribe": {
        const { message, taskId, agentId, maxUpdates = 10 } = args as {
          message: string;
          taskId?: string;
          agentId?: string;
          maxUpdates?: number;
        };
        
        const client = agentId ? agentManager.getClientById(agentId) : agentManager.getAllClients().values().next().value;
        
        if (!client) {
          throw new Error(`No available agent${agentId ? ` with ID ${agentId}` : ''}`);
        }

        const id = taskId || crypto.randomUUID();
        const stream = client.sendTaskSubscribe({
          id,
          message: {
            role: "user",
            parts: [{ text: message }],
          },
        });

        const updates = [];
        let count = 0;
        
        for await (const event of stream) {
          updates.push(event);
          count++;
          if (count >= maxUpdates) break;
          
          if (event.final) break;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ taskId: id, updates }, null, 2),
            },
          ],
        };
      }

      case "a2a_agent_info": {
        const { agentId } = args as { agentId?: string };
        
        if (agentId) {
          const client = agentManager.getClientById(agentId);
          if (!client) {
            throw new Error(`No agent found with ID ${agentId}`);
          }
          const card = await client.agentCard();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(card, null, 2),
              },
            ],
          };
        } else {
          const results = [];
          for (const [id, client] of agentManager.getAllClients()) {
            try {
              const card = await client.agentCard();
              results.push({ agentId: id, card });
            } catch (error) {
              results.push({ agentId: id, error: error instanceof Error ? error.message : String(error) });
            }
          }
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const endpoints = agentManager.getEndpoints();
  return {
    resources: [
      ...endpoints.map(endpoint => ({
        uri: `a2a://agent-card/${endpoint.id}`,
        mimeType: "application/json",
        name: `A2A Agent Card Information (${endpoint.id})`,
      })),
      {
        uri: "a2a://tasks",
        mimeType: "application/json",
        name: "Recent A2A Tasks",
      },
    ],
  };
});

// Read resources
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri.startsWith("a2a://agent-card/")) {
    const agentId = uri.split("/")[2];
    const client = agentManager.getClientById(agentId);
    
    if (!client) {
      throw new Error(`No agent found with ID ${agentId}`);
    }

    try {
      const card = await client.agentCard();
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(card, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to read agent card: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (uri === "a2a://tasks") {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ tasks: [] }, null, 2),
        },
      ],
    };
  }

  throw new Error(`Resource not found: ${uri}`);
});

async function runServer() {
  console.error("Starting A2A Client MCP Server");
  
  // Initialize agent manager
  await agentManager.initialize();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("A2A Client MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
