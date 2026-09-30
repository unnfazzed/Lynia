/** The handoff's 44×26 switch (open/closed in the Orders header, stock on a menu row). */
export function Switch({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="m-sw"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}
