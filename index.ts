#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { A2AClient } from "./a2a-client.js";

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

// Get A2A endpoint URL from environment variable or default
const a2aEndpoint = process.env.A2A_ENDPOINT_URL || "http://localhost:41241";
// Create A2A client instance
const a2aClient = new A2AClient(a2aEndpoint);

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
        },
        required: ["taskId"],
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
        },
        required: ["taskId"],
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
      description: "Get information about the connected A2A agent",
      inputSchema: {
        type: "object",
        properties: {},
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
        const { message, taskId } = args as { message: string; taskId?: string };
        const result = await a2aClient.sendTask({
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
        const { taskId } = args as { taskId: string };
        const result = await a2aClient.getTask({ id: taskId });
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
        const { taskId } = args as { taskId: string };
        const result = await a2aClient.cancelTask({ id: taskId });
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
        const { message, taskId, maxUpdates = 10 } = args as {
          message: string;
          taskId?: string;
          maxUpdates?: number;
        };
        
        const id = taskId || crypto.randomUUID();
        const stream = a2aClient.sendTaskSubscribe({
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
          
          // Break early if this is the final update
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
        try {
          const card = await a2aClient.agentCard();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(card, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error retrieving agent card: ${error instanceof Error ? error.message : String(error)}`,
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
  return {
    resources: [
      {
        uri: "a2a://agent-card",
        mimeType: "application/json",
        name: "A2A Agent Card Information",
      },
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

  if (uri === "a2a://agent-card") {
    try {
      const card = await a2aClient.agentCard();
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
    // This would normally return recently cached tasks
    // For simplicity, we're just returning an empty array
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
  console.error(`Starting A2A Client MCP Server, connecting to A2A endpoint: ${a2aEndpoint}`);
  
  // Test connection to A2A endpoint
  try {
    const card = await a2aClient.agentCard();
    console.error(`Successfully connected to A2A endpoint: ${card.name} (${card.version})`);
  } catch (error) {
    console.error(`Warning: Failed to connect to A2A endpoint: ${error instanceof Error ? error.message : String(error)}`);
    console.error("The server will start anyway, but A2A functionality may not work.");
  }
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("A2A Client MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
