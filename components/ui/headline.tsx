export function Headline({ text, supplement }: { text: string; supplement?: string }) {
  return <div className="headline"><h1>{text}</h1>{supplement && <p className="muted">{supplement}</p>}</div>;
}
