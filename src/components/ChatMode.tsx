import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { streamBackendChat } from "../lib/backendChat";
import {
  accumulateLlmUsage,
  createConversation,
  ensureReadyStore,
  getActiveMessages,
  getConversationMessages,
  persistChatStore,
  removeConversation,
  setActiveConversation,
  type ChatStoreV1,
  upsertActiveMessages,
} from "../lib/chatPersistence";
import type { CrisisSeverity } from "../lib/crisisSignals";
import { detectCrisisSignals } from "../lib/crisisSignals";
import type { ChatMessage } from "../types/chat";

type Props = {
  onUserText: (text: string) => void;
  onSeverityFromChat: (s: CrisisSeverity) => void;
  /** Clears global crisis banner when leaving the chat context (Home / New conversation). */
  onDismissCrisisBanner?: () => void;
  /** One-shot text from mood chips / landing — fills composer once then clears via callback. */
  pendingComposerSeed?: string | null;
  onPendingComposerConsumed?: () => void;
};

type InteractionMode = "live" | "readonly";

type ResumeSnap =
  | { kind: "home" }
  | { kind: "thread"; activeId: string | null; messages: ChatMessage[] };

type Surface = "home" | "chat";

export function ChatMode({
  onUserText,
  onSeverityFromChat,
  onDismissCrisisBanner,
  pendingComposerSeed,
  onPendingComposerConsumed,
}: Props) {
  const initial = useMemo(() => ensureReadyStore(), []);

  const [store, setStore] = useState<ChatStoreV1>(initial);
  const [surface, setSurface] = useState<Surface>("home");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("live");
  const [readonlyConversationId, setReadonlyConversationId] = useState<string | null>(null);
  const [readonlyFromHome, setReadonlyFromHome] = useState(false);
  const [sessionsOverlayOpen, setSessionsOverlayOpen] = useState(false);
  const [input, setInput] = useState("");
  const sessionsCloseRef = useRef<HTMLButtonElement>(null);
  const overlayFocusRestoreRef = useRef<HTMLElement | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  const resumeSnapshotRef = useRef<ResumeSnap | null>(null);

  const flushWith = useCallback((msgs: ChatMessage[]) => {
    setStore((prev) => {
      const next = upsertActiveMessages(prev, msgs);
      persistChatStore(next);
      return next;
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (!sessionsOverlayOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSessionsOverlayOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sessionsOverlayOpen]);

  useEffect(() => {
    if (!sessionsOverlayOpen) return;
    overlayFocusRestoreRef.current = document.activeElement as HTMLElement | null;
    const id = window.requestAnimationFrame(() => sessionsCloseRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(id);
      const el = overlayFocusRestoreRef.current;
      overlayFocusRestoreRef.current = null;
      el?.focus?.();
    };
  }, [sessionsOverlayOpen]);

  useEffect(() => {
    if (pendingComposerSeed == null || pendingComposerSeed === "") return;
    setInput(pendingComposerSeed);
    onPendingComposerConsumed?.();
  }, [onPendingComposerConsumed, pendingComposerSeed]);

  const sortedSessions = useMemo(
    () => [...store.conversations].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt),
    [store.conversations],
  );

  const closeOverlay = useCallback(() => setSessionsOverlayOpen(false), []);

  const openSessionReadonly = useCallback(
    (id: string) => {
      if (streaming) return;
      if (surface === "home") {
        resumeSnapshotRef.current = { kind: "home" };
        setReadonlyFromHome(true);
        const prev = storeRef.current;
        setMessages(getConversationMessages(prev, id));
        setInteractionMode("readonly");
        setReadonlyConversationId(id);
        setSurface("chat");
        closeOverlay();
        return;
      }
      if (interactionMode === "live") {
        const prev = storeRef.current;
        const flushed = upsertActiveMessages(prev, messages);
        persistChatStore(flushed);
        resumeSnapshotRef.current = {
          kind: "thread",
          activeId: flushed.activeConversationId,
          messages: [...messages],
        };
        setReadonlyFromHome(false);
        setStore(flushed);
        setMessages(getConversationMessages(flushed, id));
        setInteractionMode("readonly");
        setReadonlyConversationId(id);
        closeOverlay();
      } else {
        const prev = storeRef.current;
        setReadonlyFromHome(false);
        setMessages(getConversationMessages(prev, id));
        setReadonlyConversationId(id);
        closeOverlay();
      }
    },
    [closeOverlay, interactionMode, messages, streaming, surface],
  );

  const continueSession = useCallback(
    (id: string) => {
      if (streaming) return;
      const prev = storeRef.current;
      let next: ChatStoreV1;

      if (surface === "home") {
        next = setActiveConversation(prev, id);
        persistChatStore(next);
        resumeSnapshotRef.current = null;
        setReadonlyFromHome(false);
        setStore(next);
        setInteractionMode("live");
        setReadonlyConversationId(null);
        setSurface("chat");
        setMessages(getConversationMessages(next, id));
        closeOverlay();
        return;
      }

      if (interactionMode === "readonly") {
        next = setActiveConversation(prev, id);
      } else {
        next = upsertActiveMessages(prev, messages);
        persistChatStore(next);
        next = setActiveConversation(next, id);
      }
      persistChatStore(next);
      resumeSnapshotRef.current = null;
      setReadonlyFromHome(false);
      setStore(next);
      setInteractionMode("live");
      setReadonlyConversationId(null);
      setSurface("chat");
      setMessages(getConversationMessages(next, id));
      closeOverlay();
    },
    [closeOverlay, interactionMode, messages, streaming, surface],
  );

  const backFromReadonly = useCallback(() => {
    const snap = resumeSnapshotRef.current;
    resumeSnapshotRef.current = null;
    setReadonlyConversationId(null);
    setReadonlyFromHome(false);
    setInteractionMode("live");
    if (!snap || snap.kind === "home") {
      setSurface("home");
      setMessages([]);
      return;
    }
    if (!snap.activeId) {
      setSurface("chat");
      setMessages(getActiveMessages(storeRef.current));
      return;
    }
    const prev = storeRef.current;
    const next = setActiveConversation(prev, snap.activeId);
    persistChatStore(next);
    setStore(next);
    setSurface("chat");
    setMessages(snap.messages);
  }, []);

  const goHome = useCallback(() => {
    if (streaming) return;
    onDismissCrisisBanner?.();
    resumeSnapshotRef.current = null;
    setReadonlyConversationId(null);
    setReadonlyFromHome(false);
    setInteractionMode("live");
    setStore((prev) => {
      if (surface === "chat" && interactionMode === "live") {
        const next = upsertActiveMessages(prev, messages);
        persistChatStore(next);
        return next;
      }
      return prev;
    });
    setSurface("home");
    setMessages([]);
    setLastError(null);
    setSessionsOverlayOpen(false);
  }, [interactionMode, messages, onDismissCrisisBanner, streaming, surface]);

  const removeSessionFromStore = useCallback(
    (id: string) => {
      const viewingLiveThread =
        surface === "chat" &&
        interactionMode === "live" &&
        store.activeConversationId === id;

      const viewingReadonlyThis = interactionMode === "readonly" && readonlyConversationId === id;

      setStore((prev) => {
        const next = removeConversation(prev, id);
        persistChatStore(next);
        return next;
      });

      if (viewingReadonlyThis) {
        const snap = resumeSnapshotRef.current;
        resumeSnapshotRef.current = null;
        setReadonlyConversationId(null);
        setReadonlyFromHome(false);
        setInteractionMode("live");
        if (!snap || snap.kind === "home") {
          setSurface("home");
          setMessages([]);
        } else if (snap.kind === "thread" && snap.activeId) {
          const restoreId = snap.activeId;
          setStore((prev) => {
            const next = setActiveConversation(prev, restoreId);
            persistChatStore(next);
            return next;
          });
          setSurface("chat");
          setMessages(snap.messages);
        } else {
          setSurface("home");
          setMessages([]);
        }
      } else if (viewingLiveThread) {
        resumeSnapshotRef.current = null;
        setSurface("home");
        setMessages([]);
      }
    },
    [interactionMode, readonlyConversationId, store.activeConversationId, surface],
  );

  const newConversation = useCallback(() => {
    onDismissCrisisBanner?.();
    resumeSnapshotRef.current = null;
    setReadonlyConversationId(null);
    setReadonlyFromHome(false);
    setInteractionMode("live");
    setStore((prev) => {
      let next = prev;
      if (surface === "chat" && interactionMode === "live") {
        next = upsertActiveMessages(prev, messages);
        persistChatStore(next);
      }
      next = createConversation(next);
      persistChatStore(next);
      return next;
    });
    setSurface("chat");
    setMessages([]);
    setLastError(null);
    closeOverlay();
  }, [closeOverlay, interactionMode, messages, onDismissCrisisBanner, surface]);

  const composerLocked = streaming || interactionMode === "readonly";

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || interactionMode === "readonly") return;

    let threadMessages = messages;
    if (surface === "home") {
      const prev = storeRef.current;
      const created = createConversation(prev);
      persistChatStore(created);
      setStore(created);
      storeRef.current = created;
      setSurface("chat");
      threadMessages = [];
    }

    onUserText(text);
    onSeverityFromChat(detectCrisisSignals(text));
    setLastError(null);
    setInput("");
    const nextUser: ChatMessage[] = [...threadMessages, { role: "user", content: text }];
    setMessages(nextUser);
    setStreaming(true);
    let assistant = "";
    setMessages([...nextUser, { role: "assistant", content: "" }]);
    try {
      const convId = storeRef.current.activeConversationId ?? undefined;
      for await (const piece of streamBackendChat(nextUser, convId)) {
        if (piece.type === "delta") {
          assistant += piece.delta;
          setMessages([...nextUser, { role: "assistant", content: assistant }]);
        } else {
          const cid = storeRef.current.activeConversationId;
          if (cid) {
            setStore((prev) => {
              const next = accumulateLlmUsage(prev, cid, {
                costUsd: piece.costUsd,
                costInr: piece.costInr,
                promptTokens: piece.usage.promptTokens,
                completionTokens: piece.usage.completionTokens,
              });
              persistChatStore(next);
              return next;
            });
          }
        }
      }
      const finalMsgs: ChatMessage[] = [...nextUser, { role: "assistant", content: assistant }];
      setMessages(finalMsgs);
      flushWith(finalMsgs);
      const assistSeverity = detectCrisisSignals(assistant);
      onSeverityFromChat(assistSeverity);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Could not reach the chat server.";
      setLastError(msg);
      const finalMsgs: ChatMessage[] = [
        ...nextUser,
        {
          role: "assistant",
          content:
            "I couldn’t complete that reply. Check that the chat API is running and your network allows it. If you’re developing locally, start the backend server and use the Vite proxy (see project README).",
        },
      ];
      setMessages(finalMsgs);
      flushWith(finalMsgs);
    } finally {
      setStreaming(false);
    }
  }, [flushWith, input, interactionMode, messages, onSeverityFromChat, onUserText, streaming, surface]);

  const sessionList = (
    <ul className="chatSessionList">
      {sortedSessions.map((c) => {
        const isActiveLive =
          surface === "chat" &&
          interactionMode === "live" &&
          c.id === store.activeConversationId;
        const isActiveReadonly =
          interactionMode === "readonly" && c.id === readonlyConversationId;
        const rowActive = isActiveLive || isActiveReadonly;
        return (
          <li
            key={c.id}
            className={`chatSessionRow${rowActive ? " chatSessionRowActive" : ""}`}
          >
            <div className="chatSessionMeta">
              <span className="chatSessionTitle">{c.title}</span>
              <span className="chatSessionDate">
                {new Date(c.lastAccessedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </div>
            <div className="chatSessionRowActions">
              <button
                type="button"
                className="btnGhost chatSessionBtn"
                disabled={streaming}
                onClick={() => openSessionReadonly(c.id)}
              >
                View
              </button>
              <button
                type="button"
                className="btnSecondary chatSessionBtn"
                disabled={streaming}
                onClick={() => continueSession(c.id)}
              >
                Continue
              </button>
              <button
                type="button"
                className="btnDangerGhost chatSessionBtn"
                disabled={streaming}
                title="Remove from this device"
                aria-label={`Remove session “${c.title}” from this device`}
                onClick={() => removeSessionFromStore(c.id)}
              >
                Remove
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section className="panel chatPanel" aria-labelledby="chat-heading">
      <div className="panelHead chatPanelHead">
        <div className="chatPanelTitleGroup">
          <h2 id="chat-heading">Chat mode</h2>
          {streaming && (
            <span className="chatHeaderSpinner" role="status" aria-live="polite">
              <span className="srOnly">Buddy is thinking</span>
              <span className="chatHeaderSpinnerRing" aria-hidden />
            </span>
          )}
        </div>
        <div className="chatHeadActions">
          {surface === "chat" && (
            <button type="button" className="btnGhost chatNewBtn" onClick={goHome}>
              Home
            </button>
          )}
          <button
            type="button"
            className="btnSecondary chatNewBtn"
            onClick={() => setSessionsOverlayOpen(true)}
          >
            Sessions
          </button>
          <button type="button" className="btnSecondary chatNewBtn" onClick={newConversation}>
            New conversation
          </button>
        </div>
      </div>

      <p className="panelSub chatScopeNote">
        General wellness conversation — not therapy, diagnosis, or emergency response. Threads stay in
        your browser on this device; messages go to your configured backend only to generate replies.
      </p>

      {lastError && (
        <p className="errorText" role="alert">
          {lastError}
        </p>
      )}

      {interactionMode === "readonly" && readonlyConversationId && (
        <div className="chatReadonlyBanner" role="status">
          <p className="chatReadonlyText">
            You’re viewing a saved session. Continue to reply, or go back to where you were.
          </p>
          <div className="chatReadonlyActions">
            <button
              type="button"
              className="btnPrimary"
              disabled={streaming}
              onClick={() => continueSession(readonlyConversationId)}
            >
              Continue conversation
            </button>
            <button type="button" className="btnGhost" disabled={streaming} onClick={backFromReadonly}>
              {readonlyFromHome ? "Back to home" : "Back to previous chat"}
            </button>
          </div>
        </div>
      )}

      {surface === "home" ? (
        <div className="chatHome">
          <p className="chatHomeLead">
            Welcome. Start a new chat, open <strong>Sessions</strong> to continue or review saved
            threads, or type below to begin a fresh conversation.
          </p>
        </div>
      ) : (
        <div className="messageList" role="log" aria-live="polite">
          {messages.length === 0 && (
            <p className="emptyChat">Say what’s on your mind — short or long is fine.</p>
          )}
          {messages.map((m, i) => (
            <div key={`${i}-${m.role}`} className={`bubble ${m.role}`}>
              <span className="bubbleLabel">{m.role === "user" ? "You" : "Buddy"}</span>
              <p className="bubbleText">{m.content}</p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="composer">
        <textarea
          data-gramm="false"
          data-enable-grammarly="false"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            interactionMode === "readonly"
              ? "Continue this session to send messages…"
              : surface === "home"
                ? "Start a new message…"
                : "Type a message…"
          }
          rows={3}
          disabled={composerLocked}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          className="btnPrimary"
          disabled={composerLocked || !input.trim()}
          onClick={() => void send()}
        >
          {streaming ? "Thinking…" : "Send"}
        </button>
      </div>

      {sessionsOverlayOpen && (
        <div
          className="chatSessionsOverlay"
          role="presentation"
          onClick={() => !streaming && closeOverlay()}
        >
          <div
            className="chatSessionsModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sessions-overlay-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="chatSessionsModalHead">
              <h3 id="sessions-overlay-title">Saved sessions</h3>
              <button
                ref={sessionsCloseRef}
                type="button"
                className="btnGhost chatSessionsModalClose"
                aria-label="Close sessions"
                disabled={streaming}
                onClick={closeOverlay}
              >
                Close
              </button>
            </div>
            {sortedSessions.length === 0 ? (
              <p className="chatSessionsEmpty">No saved sessions yet.</p>
            ) : (
              sessionList
            )}
            <p className="chatSessionsFootnote">
              Stored only on this device. Removing a session cannot be undone.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
