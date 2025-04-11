/**
 * A2A client implementation based on the sample client from the A2A protocol.
 * This is a simplified version focusing on core functionality.
 */

// Type definitions
export interface Message {
  role: "user" | "agent";
  parts: MessagePart[];
}

export interface MessagePart {
  text: string;
  type?: "text";
}

export interface TaskIdParams {
  id: string;
}

export interface TaskQueryParams extends TaskIdParams {}

export interface TaskSendParams {
  id: string;
  message: Message;
}

export interface Task {
  id: string;
  status: TaskStatus;
  artifacts?: Artifact[];
  sessionId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface TaskStatus {
  state: TaskState;
  message?: Message | null;
  timestamp?: string;
}

export type TaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "canceled"
  | "failed"
  | "unknown";

export interface Artifact {
  name?: string | null;
  description?: string | null;
  parts: MessagePart[];
  index?: number;
  append?: boolean | null;
  metadata?: Record<string, unknown> | null;
  lastChunk?: boolean | null;
}

export interface TaskStatusUpdateEvent {
  id: string;
  status: TaskStatus;
  final?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface TaskArtifactUpdateEvent {
  id: string;
  artifact: Artifact;
  final?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface AgentProvider {
  organization: string;
  url?: string | null;
}

export interface AgentCapabilities {
  streaming?: boolean;
  pushNotifications?: boolean;
  stateTransitionHistory?: boolean;
}

export interface AgentAuthentication {
  schemes: string[];
  credentials?: string | null;
}

export interface AgentSkill {
  id: string;
  name: string;
  description?: string | null;
  tags?: string[] | null;
  examples?: string[] | null;
  inputModes?: string[] | null;
  outputModes?: string[] | null;
}

export interface AgentCard {
  name: string;
  description?: string | null;
  url: string;
  provider?: AgentProvider | null;
  version: string;
  documentationUrl?: string | null;
  capabilities: AgentCapabilities;
  authentication?: AgentAuthentication | null;
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  skills: AgentSkill[];
}

// JSON-RPC related types
interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params: unknown;
}

interface JSONRPCResponse<T = unknown> {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: T;
  error?: JSONRPCError;
}

interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

// Client implementation
export class A2AClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    // Ensure baseUrl doesn't end with a slash for consistency
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  }

  /**
   * Helper to generate unique request IDs.
   */
  private _generateRequestId(): string | number {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    } else {
      // Fallback for environments without crypto.randomUUID
      return Date.now();
    }
  }

  /**
   * Make a JSON-RPC request to the A2A server.
   */
  private async _makeHttpRequest<T>(
    method: string,
    params: unknown,
    acceptHeader: "application/json" | "text/event-stream" = "application/json"
  ): Promise<Response> {
    const requestId = this._generateRequestId();
    const requestBody: JSONRPCRequest = {
      jsonrpc: "2.0",
      id: requestId,
      method,
      params,
    };

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: acceptHeader,
        },
        body: JSON.stringify(requestBody),
      });
      return response;
    } catch (networkError) {
      console.error("Network error during RPC call:", networkError);
      throw new Error(`Network error: ${
        networkError instanceof Error ? networkError.message : String(networkError)
      }`);
    }
  }

  /**
   * Handle standard JSON-RPC responses.
   */
  private async _handleJsonResponse<T>(
    response: Response,
    expectedMethod?: string
  ): Promise<T> {
    let responseBody: string | null = null;
    try {
      if (!response.ok) {
        responseBody = await response.text();
        try {
          const parsedError = JSON.parse(responseBody) as JSONRPCResponse;
          if (parsedError.error) {
            throw new Error(`${parsedError.error.message} (${parsedError.error.code})`);
          }
        } catch (parseError) {
          // Ignore parsing error, fall through to generic HTTP error
        }
        throw new Error(
          `HTTP error ${response.status}: ${response.statusText}${
            responseBody ? ` - ${responseBody}` : ""
          }`
        );
      }

      responseBody = await response.text();
      const jsonResponse = JSON.parse(responseBody) as JSONRPCResponse<T>;

      if (
        typeof jsonResponse !== "object" ||
        jsonResponse === null ||
        jsonResponse.jsonrpc !== "2.0"
      ) {
        throw new Error("Invalid JSON-RPC response structure");
      }

      if (jsonResponse.error) {
        throw new Error(`${jsonResponse.error.message} (${jsonResponse.error.code})`);
      }

      return jsonResponse.result as T;
    } catch (error) {
      console.error(
        `Error processing RPC response for method ${expectedMethod || "unknown"}:`,
        error,
        responseBody ? `\nResponse Body: ${responseBody}` : ""
      );
      throw error;
    }
  }

  /**
   * Handle streaming Server-Sent Events (SSE) responses.
   */
  private async *_handleStreamingResponse<T>(
    response: Response,
    expectedMethod?: string
  ): AsyncIterable<T> {
    if (!response.ok || !response.body) {
      let errorText: string | null = null;
      try {
        errorText = await response.text();
      } catch (_) {
        /* Ignore read error */
      }
      console.error(
        `HTTP error ${response.status} received for streaming method ${
          expectedMethod || "unknown"
        }.`,
        errorText ? `Response: ${errorText}` : ""
      );
      throw new Error(
        `HTTP error ${response.status}: ${response.statusText} - Failed to establish stream.`
      );
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer.trim()) {
            console.warn(
              `SSE stream ended with partial data in buffer for method ${expectedMethod}: ${buffer}`
            );
          }
          break;
        }

        buffer += value;
        const lines = buffer.replace(/\r/g, "").split("\n\n"); // SSE messages end with \n\n
        buffer = lines.pop() || ""; // Keep potential partial message
        for (const message of lines) {
          if (message.startsWith("data: ")) {
            const dataLine = message.substring("data: ".length).trim();
            if (dataLine) {
              try {
                const parsedData = JSON.parse(dataLine) as JSONRPCResponse<T>;
                if (
                  typeof parsedData !== "object" ||
                  parsedData === null ||
                  !("jsonrpc" in parsedData && parsedData.jsonrpc === "2.0")
                ) {
                  console.error(
                    `Invalid SSE data structure received for method ${expectedMethod}:`,
                    dataLine
                  );
                  continue; // Skip invalid data
                }

                if (parsedData.error) {
                  console.error(
                    `Error received in SSE stream for method ${expectedMethod}:`,
                    parsedData.error
                  );
                  throw new Error(`${parsedData.error.message} (${parsedData.error.code})`);
                } else if (parsedData.result !== undefined) {
                  yield parsedData.result as T;
                } else {
                  console.warn(
                    `SSE data for ${expectedMethod} has neither result nor error:`,
                    parsedData
                  );
                }
              } catch (e) {
                console.error(
                  `Failed to parse SSE data line for method ${expectedMethod}:`,
                  dataLine,
                  e
                );
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error reading SSE stream for method ${expectedMethod}:`, error);
      throw error;
    } finally {
      reader.releaseLock();
      console.log(`SSE stream finished for method ${expectedMethod}.`);
    }
  }

  /**
   * Retrieves the AgentCard.
   */
  async agentCard(): Promise<AgentCard> {
    try {
      // First try the well-known endpoint
      try {
        const response = await fetch(`${this.baseUrl}/.well-known/agent.json`);
        if (response.ok) {
          return response.json();
        }
      } catch (e) {
        // Ignore and try the next approach
      }
      
      // Then try the traditional endpoint
      const cardUrl = `${this.baseUrl}/agent-card`;
      const response = await fetch(cardUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `HTTP error ${response.status} fetching agent card from ${cardUrl}: ${response.statusText}`
        );
      }

      return response.json();
    } catch (error) {
      console.error("Failed to fetch or parse agent card:", error);
      throw new Error(
        `Could not retrieve agent card: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Sends a task request to the agent (non-streaming).
   */
  async sendTask(params: TaskSendParams): Promise<Task | null> {
    const httpResponse = await this._makeHttpRequest("tasks/send", params);
    return this._handleJsonResponse<Task | null>(httpResponse, "tasks/send");
  }

  /**
   * Sends a task request and subscribes to streaming updates.
   */
  sendTaskSubscribe(
    params: TaskSendParams
  ): AsyncIterable<TaskStatusUpdateEvent | TaskArtifactUpdateEvent> {
    const streamGenerator = async function* (
      this: A2AClient
    ): AsyncIterable<TaskStatusUpdateEvent | TaskArtifactUpdateEvent> {
      const httpResponse = await this._makeHttpRequest(
        "tasks/sendSubscribe",
        params,
        "text/event-stream"
      );
      yield* this._handleStreamingResponse<TaskStatusUpdateEvent | TaskArtifactUpdateEvent>(
        httpResponse,
        "tasks/sendSubscribe"
      );
    }.bind(this)();

    return streamGenerator;
  }

  /**
   * Retrieves the current state of a task.
   */
  async getTask(params: TaskQueryParams): Promise<Task | null> {
    const httpResponse = await this._makeHttpRequest("tasks/get", params);
    return this._handleJsonResponse<Task | null>(httpResponse, "tasks/get");
  }

  /**
   * Cancels a currently running task.
   */
  async cancelTask(params: TaskIdParams): Promise<Task | null> {
    const httpResponse = await this._makeHttpRequest("tasks/cancel", params);
    return this._handleJsonResponse<Task | null>(httpResponse, "tasks/cancel");
  }

  /**
   * Resubscribes to updates for a task after connection interruption.
   */
  resubscribeTask(
    params: TaskQueryParams
  ): AsyncIterable<TaskStatusUpdateEvent | TaskArtifactUpdateEvent> {
    const streamGenerator = async function* (
      this: A2AClient
    ): AsyncIterable<TaskStatusUpdateEvent | TaskArtifactUpdateEvent> {
      const httpResponse = await this._makeHttpRequest(
        "tasks/resubscribe",
        params,
        "text/event-stream"
      );
      yield* this._handleStreamingResponse<TaskStatusUpdateEvent | TaskArtifactUpdateEvent>(
        httpResponse,
        "tasks/resubscribe"
      );
    }.bind(this)();

    return streamGenerator;
  }

  /**
   * Checks if the server likely supports optional methods based on agent card.
   */
  async supports(capability: "streaming" | "pushNotifications"): Promise<boolean> {
    try {
      const card = await this.agentCard();
      switch (capability) {
        case "streaming":
          return !!card.capabilities?.streaming;
        case "pushNotifications":
          return !!card.capabilities?.pushNotifications;
        default:
          return false;
      }
    } catch (error) {
      console.error(`Failed to determine support for capability '${capability}':`, error);
      return false;
    }
  }
}
