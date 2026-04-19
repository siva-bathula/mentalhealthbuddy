import { useCallback, useState } from "react";
import { ChatMode } from "./components/ChatMode";
import { CrisisBanner } from "./components/CrisisBanner";
import { DisclaimerGate } from "./components/DisclaimerGate";
import { HelpResources } from "./components/HelpResources";
import { HomeLandingStrip } from "./components/HomeLandingStrip";
import { PlanMode } from "./components/PlanMode";
import { ReframeMode } from "./components/ReframeMode";
import { MicroInterventionsModal } from "./components/MicroInterventionsModal";
import type { CrisisSeverity } from "./lib/crisisSignals";
import { mergeSeverity } from "./lib/crisisSignals";

type Mode = "chat" | "plan" | "reframe";
type AppScreen = "app" | "help";
type ShellView = "home" | "workspace";

export default function App() {
  const [screen, setScreen] = useState<AppScreen>("app");
  const [shellView, setShellView] = useState<ShellView>("home");
  const [mode, setMode] = useState<Mode>("chat");
  const [crisisSeverity, setCrisisSeverity] = useState<CrisisSeverity>("none");
  const [microModalOpen, setMicroModalOpen] = useState(false);
  const bumpCrisis = useCallback((s: CrisisSeverity) => {
    setCrisisSeverity((prev) => mergeSeverity(prev, s));
  }, []);

  return (
    <DisclaimerGate>
      <div className="appShell">
        <header className="appHeader">
          <div className="brand">
            <h1>Mental Health Buddy</h1>
            {shellView === "workspace" && mode === "plan" && screen === "app" && (
              <p className="tagline">
                Guided planning — conversational steps you can export as a document.
              </p>
            )}
            {shellView === "workspace" && mode === "reframe" && screen === "app" && (
              <p className="tagline">
                Cognitive reframing — evidence for and against a stuck thought, then a balanced view.
              </p>
            )}
          </div>
          <div className="appHeaderTools">
            {shellView === "workspace" && screen === "app" && (
              <button
                type="button"
                className="btnGhost headerHelpBtn"
                onClick={() => setShellView("home")}
              >
                Home
              </button>
            )}
            {screen === "app" && (
              <button
                type="button"
                className="btnSecondary headerHelpBtn"
                onClick={() => setMicroModalOpen(true)}
              >
                Calm now
              </button>
            )}
            <nav className="modeNav" aria-label="Mode">
              <button
                type="button"
                className={
                  shellView === "workspace" && mode === "chat" && screen === "app" ? "tabActive" : "tab"
                }
                onClick={() => {
                  setScreen("app");
                  setShellView("workspace");
                  setMode("chat");
                }}
              >
                Chat
              </button>
              <button
                type="button"
                className={
                  shellView === "workspace" && mode === "plan" && screen === "app" ? "tabActive" : "tab"
                }
                onClick={() => {
                  setScreen("app");
                  setShellView("workspace");
                  setCrisisSeverity("none");
                  setMode("plan");
                }}
              >
                Guided plan
              </button>
              <button
                type="button"
                className={
                  shellView === "workspace" && mode === "reframe" && screen === "app"
                    ? "tabActive"
                    : "tab"
                }
                onClick={() => {
                  setScreen("app");
                  setShellView("workspace");
                  setCrisisSeverity("none");
                  setMode("reframe");
                }}
              >
                Thought challenger
              </button>
            </nav>
            {shellView === "home" && screen === "app" && (
              <button type="button" className="btnGhost headerHelpBtn" onClick={() => setScreen("help")}>
                Help &amp; resources
              </button>
            )}
          </div>
        </header>

        <CrisisBanner severity={crisisSeverity} />

        {screen === "help" ? (
          <HelpResources onBack={() => setScreen("app")} />
        ) : shellView === "home" ? (
          <div className="appMainStack appMainStackHome">
            <HomeLandingStrip onOpenHelp={() => setScreen("help")} />
          </div>
        ) : (
          <div className="appMainStack">
            <main className="mainArea">
              {mode === "chat" ? (
                <ChatMode
                  onUserText={() => {}}
                  onSeverityFromChat={bumpCrisis}
                  onDismissCrisisBanner={() => setCrisisSeverity("none")}
                />
              ) : mode === "plan" ? (
                <PlanMode
                  onUserText={() => {}}
                  onSeverityFromChat={bumpCrisis}
                  onDismissCrisisBanner={() => setCrisisSeverity("none")}
                />
              ) : (
                <ReframeMode
                  onUserText={() => {}}
                  onSeverityFromChat={bumpCrisis}
                  onDismissCrisisBanner={() => setCrisisSeverity("none")}
                />
              )}
            </main>
          </div>
        )}

        <footer className="appFooter">
          <p>
            Educational wellness tool only — not emergency care, not a clinical diagnosis, and not
            a substitute for a licensed professional.
          </p>
        </footer>

        <MicroInterventionsModal
          open={microModalOpen}
          onClose={() => setMicroModalOpen(false)}
          onSeverityFromGrounding={bumpCrisis}
        />
      </div>
    </DisclaimerGate>
  );
}
