import React from 'react';
import { View, TextInput, StyleSheet, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../features/themes/ThemeProvider';

interface AddressBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: (url: string) => void;
}

const AddressBar: React.FC<AddressBarProps> = ({ value, onChangeText, onSubmit }) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
      <Icon name="globe-outline" size={20} color={theme.colors.primary} style={styles.icon} />
      <TextInput
        style={[
          styles.input,
          {
            color: theme.colors.text,
            borderColor: theme.colors.border,
          },
        ]}
        placeholderTextColor={theme.colors.primary}
        placeholder="Search or enter URL"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={() => onSubmit?.(value)}
        returnKeyType="go"
      />
      <Icon name="close" size={20} color={theme.colors.primary} style={styles.clearIcon} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  clearIcon: {
    marginLeft: 10,
  },
});

export default AddressBar;
