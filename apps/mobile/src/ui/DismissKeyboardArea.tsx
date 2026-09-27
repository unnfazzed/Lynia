import React from "react";
import { Keyboard, type StyleProp, View, type ViewStyle } from "react-native";

/**
 * Tapping empty space closes the keyboard. iOS number and phone pads have no return key, so without
 * this the sign-in pad stays up with no way to put it away, covering whatever sits below the field
 * (the OTP lockout recovery pushes "Back" under it on a small iPhone). Android has the system back
 * gesture for this; the wrapper is harmless there.
 *
 * A plain View that takes the touch only when nothing inside did: the responder system offers a touch
 * to the innermost view first, so a field or button keeps its own tap (the mechanism
 * `TouchableWithoutFeedback` uses). Deliberately not a `Pressable`/`Tappable`: this is not a control, and
 * the press feedback those must carry (press-feedback guardrail) would flash the whole screen on every
 * background tap. A View is not an accessibility element, so VoiceOver and TalkBack still read the
 * children one by one.
 */
export function DismissKeyboardArea({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }): React.ReactElement {
  return (
    <View style={[{ flex: 1 }, style]} onStartShouldSetResponder={() => true} onResponderRelease={() => Keyboard.dismiss()}>
      {children}
    </View>
  );
}
