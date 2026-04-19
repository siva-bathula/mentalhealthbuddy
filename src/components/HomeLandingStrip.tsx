type Props = {
  onOpenHelp: () => void;
};

/** Intro strip describing Chat, Guided plan, and Help. */
export function HomeLandingStrip({ onOpenHelp }: Props) {
  return (
    <section className="homeLandingStrip" aria-labelledby="home-landing-heading">
      <h2 id="home-landing-heading" className="srOnly">
        What you can do here
      </h2>
      <ul className="homeValueList">
        <li>
          <strong>Chat</strong> — Talk things through with a supportive companion (general wellness
          only; not therapy).
        </li>
        <li>
          <strong>Guided plan</strong> — Co-create a step-by-step wellness plan with timing and
          actions (educational only; not treatment).
        </li>
        <li>
          <strong>Thought challenger</strong> — Practice a simple thought record: evidence for and
          against a negative thought, then a more balanced perspective (skills practice; not therapy).
        </li>
        <li>
          <strong>Stress relief</strong> — Brief techniques suggested by the guided coach (plus an optional
          box-breathing timer) from <strong>Calm now</strong> in the header (short exercises; not emergency care).
        </li>
        <li>
          <strong>Help</strong> — India crisis lines and when to seek emergency care —{" "}
          <button type="button" className="linkLike" onClick={onOpenHelp}>
            open resources
          </button>
          .
        </li>
      </ul>
    </section>
  );
}
