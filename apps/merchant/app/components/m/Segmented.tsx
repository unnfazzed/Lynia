/** The handoff's segmented control with count badges (B1 "New 1 · Cooking 2 · Ready 1", C3, C5). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="m-seg" role="tablist" aria-label={label} data-n={options.length}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <em className="m-num">{o.count}</em>}
        </button>
      ))}
    </div>
  );
}
