// GENERATED — do not edit by hand. Structural-parity source of truth for LJ.login.
// Source mock: packages/design/explorations/journey/screens.jsx :: Login
// Regenerate:  node tools/parity/codegen/cli.mjs gen LJ.login
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/phone.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { View } from "react-native";
import { tokens } from "@lynia/shared/tokens";
import { Field, Button, Heading, Sub, BrandLockup } from "../src/ui";

export type LoginViewProps = {
  phone: string;
  onChangePhone: (v: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  submitDisabled?: boolean;
  error?: string;
};

export function LoginView({
  phone,
  onChangePhone,
  onSubmit,
  loading,
  submitDisabled,
  error
}: LoginViewProps): React.ReactElement {
  return <View style={{
    padding: tokens.space.screen,
    minHeight: "100%"
  }}>
    <BrandLockup />
    <Heading>Welcome to Lynia</Heading>
    {/* D-40 (docs/DESIGN-DEVIATIONS.md): the mock still draws SMS copy here (rev 2 export, D-01) —
        this line is a deliberate, ledgered divergence, not drift. A future `codegen gen LJ.login`
        run from the CURRENT mock will silently put "SMS" back; check the ledger before assuming
        the mock is right again. */}
    <Sub>We'll WhatsApp a one-time code to this number.</Sub>
    <Field label="Phone number" value={phone} onChangeText={onChangePhone} placeholder="0771234567" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" error={error} />
    <Button label="Send code" onPress={onSubmit} loading={loading} disabled={submitDisabled} />
  </View>;
}
