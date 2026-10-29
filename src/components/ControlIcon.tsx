/** Compact control glyphs. Size the clickable button independently. */
export default function ControlIcon({ name, size = 14 }: {
  name: "close" | "chevron" | "plus" | "check" | "arrow" | "more";
  size?: 12 | 14 | 16;
}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ display: "block", flexShrink: 0 }}>
    {name === "more" && <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>}
    {name === "close" && <path d="m6 6 12 12M18 6 6 18" />}
    {name === "chevron" && <path d="m7 10 5 5 5-5" />}
    {name === "plus" && <><circle cx="12" cy="12" r="9" /><path d="M8 12h8M12 8v8" /></>}
    {name === "check" && <path d="m5 12 4 4L19 6" />}
    {name === "arrow" && <path d="M7 17 17 7M7 7h10v10" />}
  </svg>;
}
