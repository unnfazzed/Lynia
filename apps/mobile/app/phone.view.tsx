// GENERATED — do not edit by hand. Structural-parity source of truth for LJ.login.
// Source mock: packages/design/explorations/journey/screens.jsx :: Login
// Regenerate:  node tools/parity/codegen/cli.mjs gen LJ.login
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/phone.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { View } from "react-native";
import { tokens } from "@lynia/shared";
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
    <Sub>We'll SMS a one-time code to this number.</Sub>
    <Field label="Phone number" value={phone} onChangeText={onChangePhone} placeholder="+263 77 000 0000" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" error={error} />
    <Button label="Send code" onPress={onSubmit} loading={loading} disabled={submitDisabled} />
  </View>;
}
