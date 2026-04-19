import type { ReactNode } from "react";
import { useState } from "react";
import { STORAGE_KEYS } from "../config/mvpSettings";

type Props = {
  children: ReactNode;
};

export function DisclaimerGate({ children }: Props) {
  const [accepted, setAccepted] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.disclaimerAccepted) === "1";
  });

  if (!accepted) {
    return (
      <div className="modalOverlay" role="dialog" aria-modal="true" aria-labelledby="disc-title">
        <div className="modalCard">
          <h1 id="disc-title">Before you continue</h1>
          <p className="modalLead">
            Mental Health Buddy is intended for people in <strong>India</strong>. It offers{" "}
            <strong>general wellness reflection and coping ideas</strong> — not therapy, diagnosis,
            or crisis intervention. It does <strong>not</strong> replace emergency services,
            therapists, psychiatrists, or other licensed care.
          </p>
          <ul className="modalList">
            <li>
              <strong>Privacy:</strong> Saved chat threads stay on <strong>this device only</strong>{" "}
              (browser storage; not encrypted in this MVP — treat as sensitive). When you send a
              message in Chat, text is sent to <strong>your backend</strong> only to generate a
              reply — nothing is stored on our servers by default in this open-source layout except
              what your deployment logs (check your hosting).
            </li>
            <li>
              If you feel unsafe or might harm yourself or others, call <strong>112</strong> or use
              the Indian mental health helplines shown when the crisis banner appears.
            </li>
          </ul>
          <button
            type="button"
            className="btnPrimary"
            onClick={() => {
              localStorage.setItem(STORAGE_KEYS.disclaimerAccepted, "1");
              setAccepted(true);
            }}
          >
            I understand — enter app
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
