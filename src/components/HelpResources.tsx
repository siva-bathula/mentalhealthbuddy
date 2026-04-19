import { crisisBundles, crisisCopy } from "../config/crisisResources";

type Props = {
  onBack: () => void;
};

/** Static India-focused resources and educational framing (non-clinical). */
export function HelpResources({ onBack }: Props) {
  const bundle = crisisBundles.IN;

  return (
    <section className="panel helpResourcesPanel" aria-labelledby="help-resources-heading">
      <div className="panelHead helpResourcesHead">
        <h2 id="help-resources-heading">Help &amp; crisis resources</h2>
        <button type="button" className="btnSecondary" onClick={onBack}>
          Back to app
        </button>
      </div>

      <p className="panelSub helpLead">
        Mental Health Buddy is not a crisis service or a substitute for licensed care. Use the lines
        below when you need human support in India — especially if you might act on thoughts of harm.
      </p>

      <article className="helpSection">
        <h3 className="helpSectionTitle">When to use emergency vs counseling</h3>
        <ul className="helpBullets">
          <li>
            <strong>Emergency (immediate danger)</strong> — Someone is injured, unconscious, violent,
            or you cannot stay safe right now: call <strong>112</strong> or local emergency services.
          </li>
          <li>
            <strong>Urgent distress (not necessarily an emergency)</strong> — Thoughts of harming
            yourself feel intense or you cannot cope: reach a crisis line below or go to the nearest
            emergency department / trusted clinician.
          </li>
          <li>
            <strong>Ongoing support</strong> — Counseling, clinical psychology, psychiatry — book
            through your doctor, insurance network, or trusted local services. You can export a
            personal plan or notes from Guided plan mode to share context (it is not a diagnosis).
          </li>
        </ul>
      </article>

      <article className="helpSection">
        <h3 className="helpSectionTitle">{crisisCopy.softTitle}</h3>
        <p className="helpBody">{crisisCopy.softBody}</p>
      </article>

      <article className="helpSection">
        <h3 className="helpSectionTitle">India helplines</h3>
        <p className="helpEmergency">{bundle.emergencyNote}</p>
        <ul className="helpResourceList">
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
                    Official site
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="helpFootnote">
          Numbers and URLs may change — verify with official sources. This list is educational
          routing only.
        </p>
      </article>
    </section>
  );
}
