import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { streamBackendJournal } from "../lib/backendJournal";
import {
  createJournalEntry,
  getActiveJournalMessages,
  loadJournalStore,
  persistJournalStore,
  removeJournalEntry,
  upsertActiveJournalMessages,
  type JournalStore,
} from "../lib/journalPersistence";
import type { CrisisSeverity } from "../lib/crisisSignals";
import { detectCrisisSignals } from "../lib/crisisSignals";
import type { ChatMessage } from "../types/chat";

type Props = {
  onSeverityFromJournal: (s: CrisisSeverity) => void;
  onDismissCrisisBanner?: () => void;
};

type Surface = "home" | "journal";

export function JournalMode({ onSeverityFromJournal, onDismissCrisisBanner }: Props) {
  const [store, setStore] = useState<JournalStore>(() => loadJournalStore());
  const [surface, setSurface] = useState<Surface>("home");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  const sortedEntries = useMemo(
    () => [...store.entries].sort((a, b) => b.updatedAt - a.updatedAt),
    [store.entries],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const flush = useCallback((msgs: ChatMessage[]) => {
    setStore((prev) => {
      const next = upsertActiveJournalMessages(prev, msgs);
      persistJournalStore(next);
      return next;
    });
  }, []);

  const newEntry = useCallback(() => {
    onDismissCrisisBanner?.();
    setStore((prev) => {
      if (surface === "journal") {
        const flushed = upsertActiveJournalMessages(prev, messages);
        persistJournalStore(flushed);
        const next = { ...flushed, activeEntryId: null };
        return next;
      }
      return { ...prev, activeEntryId: null };
    });
    setSurface("journal");
    setMessages([]);
    setLastError(null);
  }, [messages, onDismissCrisisBanner, surface]);

  const openEntry = useCallback((id: string) => {
    setStore((prev) => {
      if (surface === "journal") {
        const flushed = upsertActiveJournalMessages(prev, messages);
        persistJournalStore(flushed);
        const next = { ...flushed, activeEntryId: id };
        persistJournalStore(next);
        return next;
      }
      return { ...prev, activeEntryId: id };
    });
    const entry = store.entries.find((e) => e.id === id);
    setMessages(entry?.messages ?? []);
    setSurface("journal");
    setLastError(null);
  }, [messages, store.entries, surface]);

  const goHome = useCallback(() => {
    onDismissCrisisBanner?.();
    if (surface === "journal") {
      setStore((prev) => {
        const next = upsertActiveJournalMessages(prev, messages);
        persistJournalStore(next);
        return next;
      });
    }
    setSurface("home");
    setMessages([]);
    setLastError(null);
  }, [messages, onDismissCrisisBanner, surface]);

  const removeEntry = useCallback((id: string) => {
    setStore((prev) => {
      const next = removeJournalEntry(prev, id);
      persistJournalStore(next);
      return next;
    });
    if (store.activeEntryId === id) {
      setSurface("home");
      setMessages([]);
    }
  }, [store.activeEntryId]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    let threadMessages = messages;
    if (surface === "home") {
      setSurface("journal");
      threadMessages = [];
    }

    const nextUser: ChatMessage[] = [...threadMessages, { role: "user", content: text }];
    let prev = storeRef.current;
    if (!prev.activeEntryId) {
      const created = createJournalEntry(prev, nextUser);
      persistJournalStore(created);
      setStore(created);
      storeRef.current = created;
      prev = created;
    }

    onSeverityFromJournal(detectCrisisSignals(text));
    setLastError(null);
    setInput("");
    setMessages(nextUser);
    setStreaming(true);
    let assistant = "";
    setMessages([...nextUser, { role: "assistant", content: "" }]);

    try {
      const convId = storeRef.current.activeEntryId ?? undefined;
      for await (const piece of streamBackendJournal(nextUser, convId)) {
        if (piece.type === "delta") {
          assistant += piece.delta;
          setMessages([...nextUser, { role: "assistant", content: assistant }]);
        }
      }
      const finalMsgs: ChatMessage[] = [...nextUser, { role: "assistant", content: assistant }];
      setMessages(finalMsgs);
      flush(finalMsgs);
      onSeverityFromJournal(detectCrisisSignals(assistant));
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Could not reach the journal server.";
      setLastError(msg);
      const finalMsgs: ChatMessage[] = [
        ...nextUser,
        {
          role: "assistant",
          content:
            "I couldn't complete that reply. Check that the API server is running.",
        },
      ];
      setMessages(finalMsgs);
      flush(finalMsgs);
    } finally {
      setStreaming(false);
    }
  }, [flush, input, messages, onSeverityFromJournal, streaming, surface]);

  const activeMessages = surface === "journal"
    ? messages
    : store.activeEntryId
      ? getActiveJournalMessages(store)
      : [];

  return (
    <section className="panel journalPanel" aria-labelledby="journal-heading">
      <div className="panelHead chatPanelHead">
        <div className="chatPanelTitleGroup">
          <h2 id="journal-heading">Journal</h2>
          {streaming && (
            <span className="chatHeaderSpinner" role="status" aria-live="polite">
              <span className="srOnly">Buddy is reflecting</span>
              <span className="chatHeaderSpinnerRing" aria-hidden />
            </span>
          )}
        </div>
        <div className="chatHeadActions">
          {surface === "journal" && (
            <button type="button" className="btnGhost chatNewBtn" onClick={goHome}>
              Entries
            </button>
          )}
          <button type="button" className="btnSecondary chatNewBtn" onClick={newEntry}>
            New entry
          </button>
        </div>
      </div>

      <p className="panelSub chatScopeNote">
        Free-write anything on your mind. The AI reflects back what you shared and asks one gentle
        follow-up question. Entries stay only in your browser.
      </p>

      {lastError && (
        <p className="errorText" role="alert">
          {lastError}
        </p>
      )}

      {surface === "home" ? (
        <div className="journalHome">
          {sortedEntries.length === 0 ? (
            <p className="chatHomeLead">
              No journal entries yet. Write anything — your day, a feeling, a thought — and the AI
              will gently reflect it back.
            </p>
          ) : (
            <ul className="chatSessionList">
              {sortedEntries.map((entry) => (
                <li key={entry.id} className="chatSessionRow">
                  <div className="chatSessionMeta">
                    <span className="chatSessionTitle">{entry.title}</span>
                    <span className="chatSessionDate">
                      {new Date(entry.updatedAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  <div className="chatSessionRowActions">
                    <button
                      type="button"
                      className="btnSecondary chatSessionBtn"
                      onClick={() => openEntry(entry.id)}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      className="btnDangerGhost chatSessionBtn"
                      title="Delete entry"
                      aria-label={`Delete entry "${entry.title}"`}
                      onClick={() => removeEntry(entry.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="messageList" role="log" aria-live="polite">
          {activeMessages.length === 0 && (
            <p className="emptyChat">
              Write freely — your thoughts, feelings, or anything from your day.
            </p>
          )}
          {activeMessages.map((m, i) => (
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
            surface === "home"
              ? "Start a new entry…"
              : "Continue writing…"
          }
          rows={4}
          disabled={streaming}
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
          disabled={streaming || !input.trim()}
          onClick={() => void send()}
        >
          {streaming ? "Reflecting…" : "Share"}
        </button>
      </div>
    </section>
  );
}
