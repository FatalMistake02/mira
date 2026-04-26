import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

export type MobileTheme = {
  isDark: boolean;
  colors: {
    background: string;
    surface: string;
    surfaceAlt: string;
    border: string;
    text: string;
    textMuted: string;
    textDim: string;
    accent: string;
    accentSoft: string;
    inputBackground: string;
    inputBorder: string;
    buttonBackground: string;
    buttonText: string;
    danger: string;
    success: string;
  };
  metrics: {
    radius: number;
    panelRadius: number;
    spacing: number;
    controlHeight: number;
    tabHeight: number;
  };
};

export function stylesFor(theme: MobileTheme) {
  return StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    pageScroll: {
      padding: theme.metrics.spacing * 1.5,
      gap: theme.metrics.spacing,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: theme.metrics.panelRadius,
      padding: theme.metrics.spacing,
      gap: theme.metrics.spacing * 0.75,
    },
    cardRow: {
      flexDirection: 'row',
      gap: theme.metrics.spacing * 0.75,
      flexWrap: 'wrap',
      alignItems: 'center',
    },
    title: {
      color: theme.colors.text,
      fontSize: 28,
      fontWeight: '700',
    },
    subtitle: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    sectionCaption: {
      color: theme.colors.textDim,
      fontSize: 12,
      lineHeight: 18,
    },
    bodyText: {
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 20,
    },
    mutedText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    button: {
      minHeight: theme.metrics.controlHeight,
      paddingHorizontal: theme.metrics.spacing,
      paddingVertical: 10,
      borderRadius: theme.metrics.radius,
      backgroundColor: theme.colors.buttonBackground,
      borderWidth: 1,
      borderColor: theme.colors.border,
      justifyContent: 'center',
    },
    buttonPrimary: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    buttonDanger: {
      backgroundColor: `${theme.colors.danger}22`,
      borderColor: theme.colors.danger,
    },
    buttonText: {
      color: theme.colors.buttonText,
      fontSize: 14,
      fontWeight: '600',
    },
    buttonPrimaryText: {
      color: theme.colors.text,
    },
    menuButton: {
      minHeight: 42,
      paddingHorizontal: theme.metrics.spacing,
      paddingVertical: 10,
      borderRadius: theme.metrics.radius,
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    menuButtonText: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '400',
    },
    textInput: {
      minHeight: theme.metrics.controlHeight,
      borderRadius: theme.metrics.radius,
      borderWidth: 1,
      borderColor: theme.colors.inputBorder,
      backgroundColor: theme.colors.inputBackground,
      color: theme.colors.text,
      paddingHorizontal: theme.metrics.spacing,
      paddingVertical: 10,
      fontSize: 15,
    },
    multilineInput: {
      minHeight: 220,
      textAlignVertical: 'top',
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: theme.metrics.spacing,
    },
    rowGrow: {
      flex: 1,
      gap: 4,
    },
    chip: {
      paddingHorizontal: theme.metrics.spacing,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
    },
    chipActive: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent,
    },
    chipText: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
    listItem: {
      borderRadius: theme.metrics.radius,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      padding: theme.metrics.spacing,
      gap: 6,
    },
    listItemTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    listItemMeta: {
      color: theme.colors.textMuted,
      fontSize: 12,
    },
    empty: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
      paddingVertical: theme.metrics.spacing * 1.5,
    },
    heroLogo: {
      width: 112,
      height: 112,
      alignSelf: 'center',
      resizeMode: 'contain',
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 999,
      backgroundColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconButtonPrimary: {
      backgroundColor: `${theme.colors.accent}20`,
    },
    iconButtonDanger: {
      backgroundColor: `${theme.colors.danger}15`,
    },
  });
}

export function AppButton({
  theme,
  label,
  onPress,
  primary = false,
  danger = false,
}: {
  theme: MobileTheme;
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  const styles = stylesFor(theme);
  return (
    <Pressable
      style={[styles.button, primary && styles.buttonPrimary, danger && styles.buttonDanger]}
      onPress={onPress}
    >
      <Text style={[styles.buttonText, primary && styles.buttonPrimaryText]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({
  theme,
  icon: Icon,
  onPress,
  primary = false,
  danger = false,
  size = 20,
}: {
  theme: MobileTheme;
  icon: LucideIcon;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  size?: number;
}) {
  const styles = stylesFor(theme);
  const iconColor = danger ? theme.colors.danger : primary ? theme.colors.accent : theme.colors.textMuted;
  return (
    <Pressable
      style={[styles.iconButton, primary && styles.iconButtonPrimary, danger && styles.iconButtonDanger]}
      onPress={onPress}
    >
      <Icon size={size} color={iconColor} strokeWidth={1.8} />
    </Pressable>
  );
}

export function MenuButton({
  theme,
  label,
  onPress,
  danger = false,
}: {
  theme: MobileTheme;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const styles = stylesFor(theme);
  return (
    <Pressable style={styles.menuButton} onPress={onPress}>
      <Text style={[styles.menuButtonText, danger && { color: theme.colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

export function TabCountButton({
  theme,
  count,
  onPress,
}: {
  theme: MobileTheme;
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={{
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
      }}
      onPress={onPress}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 3,
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderColor: theme.colors.textMuted,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: '600' }}>{count}</Text>
      </View>
    </Pressable>
  );
}

export function ChoiceChips<T extends string>({
  theme,
  value,
  options,
  onChange,
}: {
  theme: MobileTheme;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const styles = stylesFor(theme);
  return (
    <View style={styles.cardRow}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          style={[styles.chip, option.value === value && styles.chipActive]}
          onPress={() => onChange(option.value)}
        >
          <Text style={styles.chipText}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
