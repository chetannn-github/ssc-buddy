import { forwardRef } from "react";
import { TextInput, type TextInputProps } from "react-native";

export const UppercaseTextInput = forwardRef<TextInput, TextInputProps>(function UppercaseTextInput({ onChangeText, ...props }, ref) {
  return <TextInput {...props} ref={ref} autoCapitalize="characters"
    onChangeText={(value) => onChangeText?.(value.toUpperCase())} />;
});
