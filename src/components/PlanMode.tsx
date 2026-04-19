import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { streamBackendPlan } from "../lib/backendPlan";
import {
  accumulatePlanLlmUsage,
  createPlanConversation,
  ensureReadyPlanStore,
  getPlanActiveMessages,
  getPlanConversationMessages,
  persistPlanStore,
  removePlanConversation,
  setActivePlanConversation,
  type PlanStoreV1,
  upsertPlanActiveMessages,
} from "../lib/planPersistence";
import {
  getCachedPlanExport,
  prunePlanExportCache,
  removeCachedPlanExport,
  saveCachedPlanExport,
} from "../lib/planExportCache";
import { downloadPlanDocument, triggerTextFileDownload } from "../lib/planExportDownload";
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

export function PlanMode({
  onUserText,
  onSeverityFromChat,
  onDismissCrisisBanner,
  pendingComposerSeed,
  onPendingComposerConsumed,
}: Props) {
  const initial = useMemo(() => ensureReadyPlanStore(), []);

  const [store, setStore] = useState<PlanStoreV1>(initial);
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
  const [exporting, setExporting] = useState(false);
  const [exportCacheRev, setExportCacheRev] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  const resumeSnapshotRef = useRef<ResumeSnap | null>(null);

  const flushWith = useCallback((msgs: ChatMessage[]) => {
    setStore((prev) => {
      const next = upsertPlanActiveMessages(prev, msgs);
      persistPlanStore(next);
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

  const exportConversationId =
    surface === "chat"
      ? interactionMode === "readonly" && readonlyConversationId
        ? readonlyConversationId
        : store.activeConversationId
      : null;

  const cachedPlanExport = useMemo(
    () => getCachedPlanExport(exportConversationId),
    [exportConversationId, exportCacheRev],
  );

  useEffect(() => {
    const ids = new Set(store.conversations.map((c) => c.id));
    prunePlanExportCache(ids);
    setExportCacheRev((r) => r + 1);
  }, [store.conversations]);

  const closeOverlay = useCallback(() => setSessionsOverlayOpen(false), []);

  const openSessionReadonly = useCallback(
    (id: string) => {
      if (streaming) return;
      if (surface === "home") {
        resumeSnapshotRef.current = { kind: "home" };
        setReadonlyFromHome(true);
        const prev = storeRef.current;
        setMessages(getPlanConversationMessages(prev, id));
        setInteractionMode("readonly");
        setReadonlyConversationId(id);
        setSurface("chat");
        closeOverlay();
        return;
      }
      if (interactionMode === "live") {
        const prev = storeRef.current;
        const flushed = upsertPlanActiveMessages(prev, messages);
        persistPlanStore(flushed);
        resumeSnapshotRef.current = {
          kind: "thread",
          activeId: flushed.activeConversationId,
          messages: [...messages],
        };
        setReadonlyFromHome(false);
        setStore(flushed);
        setMessages(getPlanConversationMessages(flushed, id));
        setInteractionMode("readonly");
        setReadonlyConversationId(id);
        closeOverlay();
      } else {
        const prev = storeRef.current;
        setReadonlyFromHome(false);
        setMessages(getPlanConversationMessages(prev, id));
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
      let next: PlanStoreV1;

      if (surface === "home") {
        next = setActivePlanConversation(prev, id);
        persistPlanStore(next);
        resumeSnapshotRef.current = null;
        setReadonlyFromHome(false);
        setStore(next);
        setInteractionMode("live");
        setReadonlyConversationId(null);
        setSurface("chat");
        setMessages(getPlanConversationMessages(next, id));
        closeOverlay();
        return;
      }

      if (interactionMode === "readonly") {
        next = setActivePlanConversation(prev, id);
      } else {
        next = upsertPlanActiveMessages(prev, messages);
        persistPlanStore(next);
        next = setActivePlanConversation(next, id);
      }
      persistPlanStore(next);
      resumeSnapshotRef.current = null;
      setReadonlyFromHome(false);
      setStore(next);
      setInteractionMode("live");
      setReadonlyConversationId(null);
      setSurface("chat");
      setMessages(getPlanConversationMessages(next, id));
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
      setMessages(getPlanActiveMessages(storeRef.current));
      return;
    }
    const prev = storeRef.current;
    const next = setActivePlanConversation(prev, snap.activeId);
    persistPlanStore(next);
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
        const next = upsertPlanActiveMessages(prev, messages);
        persistPlanStore(next);
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
        const next = removePlanConversation(prev, id);
        persistPlanStore(next);
        removeCachedPlanExport(id);
        setExportCacheRev((r) => r + 1);
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
            const next = setActivePlanConversation(prev, restoreId);
            persistPlanStore(next);
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
        next = upsertPlanActiveMessages(prev, messages);
        persistPlanStore(next);
      }
      next = createPlanConversation(next);
      persistPlanStore(next);
      return next;
    });
    setSurface("chat");
    setMessages([]);
    setLastError(null);
    closeOverlay();
  }, [closeOverlay, interactionMode, messages, onDismissCrisisBanner, surface]);

  const handleDownloadPlan = useCallback(async () => {
    const msgsForExport =
      interactionMode === "readonly" && readonlyConversationId
        ? getPlanConversationMessages(storeRef.current, readonlyConversationId)
        : messages;
    if (!msgsForExport.some((m) => m.role === "assistant" && m.content.trim())) return;
    const convId =
      interactionMode === "readonly" && readonlyConversationId
        ? readonlyConversationId
        : storeRef.current.activeConversationId;
    const title =
      storeRef.current.conversations.find((c) => c.id === convId)?.title ?? "Wellness plan";
    setExporting(true);
    setLastError(null);
    try {
      const { body, filename } = await downloadPlanDocument({
        messages: msgsForExport,
        title,
        format: "plain",
      });
      if (convId) {
        saveCachedPlanExport(convId, body, filename);
        setExportCacheRev((r) => r + 1);
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : "Could not download plan.");
    } finally {
      setExporting(false);
    }
  }, [interactionMode, messages, readonlyConversationId]);

  const handleRedownloadCached = useCallback(() => {
    if (surface !== "chat") return;
    const convId =
      interactionMode === "readonly" && readonlyConversationId
        ? readonlyConversationId
        : storeRef.current.activeConversationId;
    const cached = convId ? getCachedPlanExport(convId) : null;
    if (!cached) return;
    triggerTextFileDownload(cached.body, cached.filename);
  }, [surface, interactionMode, readonlyConversationId]);

  const composerLocked = streaming || interactionMode === "readonly";

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || interactionMode === "readonly") return;

    let threadMessages = messages;
    if (surface === "home") {
      const prev = storeRef.current;
      const created = createPlanConversation(prev);
      persistPlanStore(created);
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
      for await (const piece of streamBackendPlan(nextUser, convId)) {
        if (piece.type === "delta") {
          assistant += piece.delta;
          setMessages([...nextUser, { role: "assistant", content: assistant }]);
        } else {
          const cid = storeRef.current.activeConversationId;
          if (cid) {
            setStore((prev) => {
              const next = accumulatePlanLlmUsage(prev, cid, {
                costUsd: piece.costUsd,
                costInr: piece.costInr,
                promptTokens: piece.usage.promptTokens,
                completionTokens: piece.usage.completionTokens,
              });
              persistPlanStore(next);
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
            "I couldn’t complete that reply. Check that the plan API is running and your network allows it. If you’re developing locally, start the backend server and use the Vite proxy (see project README).",
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
    <section className="panel chatPanel planPanel" aria-labelledby="plan-heading">
      <div className="panelHead chatPanelHead">
        <div className="chatPanelTitleGroup">
          <h2 id="plan-heading">Guided plan</h2>
          {streaming && (
            <span className="chatHeaderSpinner" role="status" aria-live="polite">
              <span className="srOnly">Guide is thinking</span>
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
          {surface === "chat" &&
            messages.some((m) => m.role === "assistant" && m.content.trim()) && (
              <>
                <button
                  type="button"
                  className="btnSecondary chatNewBtn"
                  disabled={streaming || exporting}
                  onClick={() => void handleDownloadPlan()}
                >
                  {exporting ? "Preparing…" : "Download plan"}
                </button>
                {cachedPlanExport && (
                  <button
                    type="button"
                    className="btnGhost chatNewBtn"
                    disabled={streaming || exporting}
                    onClick={handleRedownloadCached}
                  >
                    Redownload saved copy
                  </button>
                )}
              </>
            )}
        </div>
      </div>

      <p className="panelSub chatScopeNote">
        Build a personal wellness plan through conversation — not therapy or a clinical program. Plans
        stay on this device; messages go to your backend only to generate replies. Use{" "}
        <strong>Download plan</strong> for a text file you can keep offline; the last download per
        session is cached on this device so you can <strong>Redownload saved copy</strong> later.
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
            Describe what you want to work on (for example calmer evenings or less panic). The guide
            will ask a few questions, then suggest steps with timing. Open <strong>Sessions</strong>{" "}
            for saved plans.
          </p>
        </div>
      ) : (
        <div className="messageList" role="log" aria-live="polite">
          {messages.length === 0 && (
            <p className="emptyChat">Share your goal or situation — short or long is fine.</p>
          )}
          {messages.map((m, i) => (
            <div key={`${i}-${m.role}`} className={`bubble ${m.role}`}>
              <span className="bubbleLabel">{m.role === "user" ? "You" : "Guide"}</span>
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
