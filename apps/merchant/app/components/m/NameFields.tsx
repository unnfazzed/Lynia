import type { PersonName, PersonNameErrors } from "../../lib/person-name";

/**
 * First name · Surname side by side — the customer sign-up's C5 pair (`grid 1fr 1fr`, gap 12; ledger D-124),
 * used for the person's own name on the merchant sign-up (A4) and Join (A5).
 */
export function NameFields({
  idPrefix,
  value,
  errors,
  disabled,
  onChange,
}: {
  idPrefix: string;
  value: PersonName;
  errors?: PersonNameErrors;
  disabled?: boolean;
  onChange: (key: keyof PersonName, v: string) => void;
}) {
  return (
    <div className="m-name-pair">
      <NameField id={`${idPrefix}-first`} label="First name" autoComplete="given-name" value={value.firstName} error={errors?.firstName} disabled={disabled} onChange={(v) => onChange("firstName", v)} />
      <NameField id={`${idPrefix}-last`} label="Surname" autoComplete="family-name" value={value.lastName} error={errors?.lastName} disabled={disabled} onChange={(v) => onChange("lastName", v)} />
    </div>
  );
}

function NameField({
  id,
  label,
  autoComplete,
  value,
  error,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  autoComplete: string;
  value: string;
  error?: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="m-fld">
      <label htmlFor={id}>{label}</label>
      <div className="m-in" data-invalid={error ? true : undefined}>
        <input id={id} value={value} autoComplete={autoComplete} maxLength={60} disabled={disabled} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)} />
      </div>
      {error && <span className="m-err">{error}</span>}
    </div>
  );
}
