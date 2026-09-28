import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Reports tag sentences with [사실] / [해석] / 확인 필요; render those as chips.
const TAGS: Record<string, string> = {
  사실: "bg-ok/15 text-ok",
  해석: "bg-accent/15 text-accent",
  "확인 필요": "bg-warn/15 text-warn",
  "원문 재확인 필요": "bg-warn/15 text-warn",
  "변화 없음": "bg-surface-2 text-muted",
};
const TAG_RE = /\[(사실|해석|확인 필요|원문 재확인 필요|변화 없음)\]/g;

const components: Components = {
  h1: ({ children }) => <h2 className="mt-5 mb-2 text-lg font-semibold first:mt-0">{children}</h2>,
  h2: ({ children }) => <h3 className="mt-5 mb-2 text-base font-semibold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-4 mb-1.5 text-sm font-semibold">{children}</h4>,
  p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener" className="break-all text-accent underline-offset-2 hover:underline">
      {children}
    </a>
  ),
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-line pl-3 text-muted">{children}</blockquote>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-line px-2 py-1.5 text-left font-medium text-muted">{children}</th>,
  td: ({ children }) => <td className="border-b border-line px-2 py-1.5 align-top">{children}</td>,
  pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs">{children}</pre>,
  code: ({ children, className }) => {
    const value = String(children);
    if (!className && value in TAGS) return <span className={`chip mr-1 align-middle ${TAGS[value]}`}>{value}</span>;
    return <code className="rounded bg-surface-2 px-1 py-0.5 text-[0.85em]">{children}</code>;
  },
  img: () => null,
};

export function Markdown({ source }: { source: string }) {
  // Tags become inline code so the `code` renderer can turn them into chips.
  const prepared = source.replace(TAG_RE, "`$1`");
  return (
    <div className="min-w-0 text-sm break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {prepared}
      </ReactMarkdown>
    </div>
  );
}
