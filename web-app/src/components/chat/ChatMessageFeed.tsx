'use client';

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ToolCallBlock from "@/components/ToolCallBlock";
import EmptyStateChat from "@/components/EmptyStateChat";
import type { RenderItem, Session } from "@/app/chat/types";

interface ChatMessageFeedProps {
  renderItems: RenderItem[];
  isLoading: boolean;
  sessionsLoaded: boolean;
  activeSession: Session | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  onPromptSelect: (prompt: string) => void;
}

export default function ChatMessageFeed({
  renderItems,
  isLoading,
  sessionsLoaded,
  activeSession,
  messagesEndRef,
  chatContainerRef,
  onPromptSelect,
}: ChatMessageFeedProps) {
  return (
    <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {renderItems.length === 0 ? (
          !sessionsLoaded ? null : activeSession?.initiated_by === "agent" ? (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <p className="text-lg text-zinc-600">Your agent is preparing a welcome...</p>
                <p className="mt-2 text-sm text-zinc-400">
                  It&apos;s reviewing your profile and will be right with you.
                </p>
              </div>
            </div>
          ) : (
            <EmptyStateChat onPromptSelect={onPromptSelect} />
          )
        ) : (
          renderItems.map((item) => {
            if (item.type === "tool_pair") {
              return (
                <div key={item.id} className="flex justify-start">
                  <ToolCallBlock
                    toolName={item.call.toolName ?? item.call.content}
                    toolArguments={item.call.toolArguments ?? item.call.content}
                    output={item.output ? item.output.content : null}
                  />
                </div>
              );
            }
            const message = item.message;
            return (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-lg rounded-lg px-4 py-3 ${
                    message.role === "user"
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-900"
                  }`}
                >
                  {message.role === "user" ? (
                    <div>
                      {message.content && (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">
                          {message.content}
                        </p>
                      )}
                      {message.imageUrls?.map((url) => (
                        <img
                          key={url}
                          src={url}
                          alt="attachment"
                          className="mt-2 max-h-48 max-w-full rounded-md object-cover"
                        />
                      ))}
                      {message.textFileNames?.map((name) => (
                        <div key={name} className="mt-2 flex items-center gap-1.5 rounded-md bg-zinc-700 px-2 py-1">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-300">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span className="truncate text-xs text-zinc-200">{name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="prose prose-sm prose-zinc max-w-none text-zinc-900 [&_a]:text-blue-600 [&_a]:underline [&_a]:break-all [&_pre]:bg-zinc-800 [&_pre]:text-zinc-100 [&_code:not(pre_code)]:bg-zinc-200 [&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:text-zinc-800">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-3">
              <div className="flex gap-1">
                <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" />
                <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 animation-delay-200" />
                <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 animation-delay-400" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
