import GlossaryEditor from "./GlossaryEditor";

export default function Page(){return <div className="glossary-page"><div className="glossary-hero"><div><div className="ey">Scouting model</div><h1>Scouting Glossary</h1><p>Definitions, weights, thresholds, and adjustments that power the Scouting sheets. Edit a setting here and the connected scouting formulas use the updated value.</p></div><div className="glossary-hero-note"><strong>Live model inputs</strong><span>Edits save automatically and keep the underlying workbook references intact.</span></div></div><GlossaryEditor/></div>}
