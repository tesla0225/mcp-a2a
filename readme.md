# A2A Client MCP Server

An MCP server that acts as a client to the Agent-to-Agent (A2A) protocol, allowing LLMs to interact with A2A agents through the Model Context Protocol (MCP).

## Features

- Connect to any A2A-compatible agent
- Send and receive messages
- Track and manage tasks
- Support for streaming responses
- Query agent capabilities and metadata

## Installation

```bash
# Install globally
npm install -g a2a-client-mcp-server

# Or run directly with npx
npx a2a-client-mcp-server
```

## Configuration

### Environment Variables

- `A2A_ENDPOINT_URL`: URL of the A2A agent to connect to (default: "http://localhost:41241")

## Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

### NPX

```bash
npm run build
npm link
```

```json
{
  "mcpServers": {
    "a2a-client": {
      "command": "npx",
      "args": ["-y", "a2a-client-mcp-server"],
      "env": {
        "A2A_ENDPOINT_URL": "http://localhost:41241"
      }
    }
  }
}
```

### Docker

Build the Docker image:

```bash
docker build -t a2a-client-mcp-server .
```

Configure Claude Desktop:

```json
{
  "mcpServers": {
    "a2a-client": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "A2A_ENDPOINT_URL",
        "a2a-client-mcp-server"
      ],
      "env": {
        "A2A_ENDPOINT_URL": "http://localhost:41241"
      }
    }
  }
}
```

## Available Tools

### a2a_send_task
Send a task to an A2A agent
- `message` (string): Message to send to the agent
- `taskId` (string, optional): Task ID (generated if not provided)

### a2a_get_task
Get the current state of a task
- `taskId` (string): ID of the task to retrieve

### a2a_cancel_task
Cancel a running task
- `taskId` (string): ID of the task to cancel

### a2a_send_task_subscribe
Send a task and subscribe to updates (streaming)
- `message` (string): Message to send to the agent
- `taskId` (string, optional): Task ID (generated if not provided)
- `maxUpdates` (number, optional): Maximum updates to receive (default: 10)

### a2a_agent_info
Get information about the connected A2A agent
- No parameters required

## Resources

The server provides access to two MCP resources:

- `a2a://agent-card`: Information about the connected A2A agent
- `a2a://tasks`: List of recent A2A tasks

## Example Usage

This example shows how to use A2A Client MCP Server to interact with a Coder Agent:

```
First, let me explore what A2A agent we're connected to.

I'll use the a2a_agent_info tool to check the agent details.

The agent provides a coding service that can generate files based on natural language instructions. Let's create a simple Python script.

I'll use the a2a_send_task tool to send a request:

Task: "Create a Python function that calculates the Fibonacci sequence"

Now I can check the task status using a2a_get_task with the task ID from the previous response.

The agent has created the requested Python code. I can now retrieve and use this code in my project.
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run watch
```

## License

MIT
