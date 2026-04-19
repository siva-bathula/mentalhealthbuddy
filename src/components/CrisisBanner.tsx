import { crisisBundles, crisisCopy } from "../config/crisisResources";
import type { CrisisSeverity } from "../lib/crisisSignals";

type Props = {
  severity: CrisisSeverity;
};

export function CrisisBanner({ severity }: Props) {
  if (severity === "none") return null;

  const bundle = crisisBundles.IN;
  const copy =
    severity === "urgent"
      ? { title: crisisCopy.urgentTitle, body: crisisCopy.urgentBody }
      : { title: crisisCopy.softTitle, body: crisisCopy.softBody };

  return (
    <aside
      className={`crisisBanner ${severity === "urgent" ? "crisisUrgent" : "crisisSoft"}`}
      role="alert"
    >
      <div className="crisisHeader">
        <h2>{copy.title}</h2>
      </div>
      <p>{copy.body}</p>
      <p className="crisisEmergency">{bundle.emergencyNote}</p>
      <ul className="crisisList">
        {bundle.resources.map((r) => (
          <li key={r.name}>
            <strong>{r.name}</strong>
            {" — "}
            {r.detail}
            {r.phone && (
              <>
                {" "}
                <a href={`tel:${r.phone.replace(/\s/g, "").replace(/-/g, "")}`}>{r.phone}</a>
              </>
            )}
            {r.url && (
              <>
                {" "}
                <a href={r.url} target="_blank" rel="noreferrer">
                  Website
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
