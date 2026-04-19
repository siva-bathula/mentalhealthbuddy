import type { CrisisRegionCode } from "./regions";

export type CrisisResource = {
  name: string;
  detail: string;
  phone?: string;
  url?: string;
};

export type CrisisBundle = {
  emergencyNote: string;
  resources: CrisisResource[];
};

/** Non-clinical crisis routing only — always encourage emergency services when at risk. */
export const crisisCopy = {
  urgentTitle: "If you might act on thoughts of harm",
  urgentBody:
    "Your safety comes first. This app is not a crisis service. If you are in immediate danger or might hurt yourself or someone else, contact emergency or mental health helplines right away.",
  softTitle: "You deserve support",
  softBody:
    "If anything you read here feels overwhelming, consider reaching out to someone you trust or a crisis line in India. You are not alone.",
} as const;

/** India-focused resources for Indian residents only. Numbers may change — verify from official sources periodically. */
export const crisisBundles: Record<CrisisRegionCode, CrisisBundle> = {
  IN: {
    emergencyNote:
      "For police, ambulance, or fire emergency anywhere in India, dial 112 from your phone.",
    resources: [
      {
        name: "National Emergency Number",
        detail: "Integrated emergency (police / ambulance / fire)",
        phone: "112",
        url: "https://112.gov.in/",
      },
      {
        name: "Tele-MANAS — National Mental Health Programme",
        detail: "Government toll-free mental health helpline (national)",
        phone: "14416",
      },
      {
        name: "KIRAN — Mental Health Rehabilitation Helpline",
        detail: "Ministry of Social Justice toll-free distress line",
        phone: "1800-599-0019",
        url: "https://socialjustice.gov.in/",
      },
      {
        name: "Vandrevala Foundation Mental Health Helpline",
        detail: "24×7 confidential support — call or SMS “HI”",
        phone: "9999666555",
        url: "https://www.vandrevalafoundation.com/",
      },
      {
        name: "iCALL — Tata Institute of Social Sciences",
        detail: "Psychosocial helpline — check official site for hours",
        phone: "9152987821",
        url: "https://icallhelpline.org/",
      },
    ],
  },
};
