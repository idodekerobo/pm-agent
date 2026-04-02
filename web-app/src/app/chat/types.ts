export interface Message {
  id: string;
  role: "user" | "assistant" | "tool_call" | "tool_output";
  content: string;
  imageUrls?: string[];
  textFileNames?: string[];
  toolName?: string;
  callId?: string;
  toolArguments?: string;
}

export interface AttachedFile {
  id: string;
  file: File;
  kind: "image" | "text";
  previewUrl: string | null;
  textContent: string | null;
  error: string | null;
}

export type RenderItem =
  | { type: "message"; message: Message }
  | { type: "tool_pair"; id: string; call: Message; output: Message | null };

export interface Session {
  id: string;
  created_at: string;
  display_name?: string | null;
  is_pinned: boolean;
  initiated_by: string;
  last_read_at: string | null;
  last_message_at: string;
  provider_session_id?: string | null;
  workspace_path?: string | null;
}
