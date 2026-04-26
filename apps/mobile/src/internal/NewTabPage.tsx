import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BrowserSettings } from '../features/settings/browserSettings';
import { useTabs } from '../features/tabs/TabsProvider';
import type { MobileTheme } from './shared';

const miraLogo = require('../assets/mira_logo.png');
const NEW_TAB_INTRO_SHOWN_KEY = 'mira.newtab.intro.shown.v1';

export default function NewTabPage({
  theme,
  settings,
}: {
  theme: MobileTheme;
  settings: BrowserSettings;
}) {
  const { navigate } = useTabs();
  const [query, setQuery] = useState('');
  const [showBranding, setShowBranding] = useState(true);
  const [showIntro, setShowIntro] = useState(false);

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoTranslateY = useRef(new Animated.Value(10)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const checkIntro = async () => {
      const showBrandingSetting = settings.showNewTabBranding;
      if (settings.disableNewTabIntro) {
        setShowBranding(showBrandingSetting);
        setShowIntro(false);
        return;
      }
      const alreadyShown = (await AsyncStorage.getItem(NEW_TAB_INTRO_SHOWN_KEY)) === '1';
      if (alreadyShown) {
        setShowBranding(showBrandingSetting);
        setShowIntro(false);
      } else {
        await AsyncStorage.setItem(NEW_TAB_INTRO_SHOWN_KEY, '1');
        setShowBranding(true);
        setShowIntro(true);
      }
    };
    checkIntro();
  }, [settings.showNewTabBranding, settings.disableNewTabIntro]);

  useEffect(() => {
    if (showIntro) {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(logoOpacity, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(logoTranslateY, {
            toValue: 0,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (showBranding) {
      logoOpacity.setValue(1);
      textOpacity.setValue(1);
    }
  }, [showIntro, showBranding, logoOpacity, logoTranslateY, textOpacity]);

  const shouldRenderBranding = showBranding || showIntro;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        alignItems: 'center',
        paddingTop: 40,
        paddingHorizontal: 20,
      }}
    >
      <View style={{ height: 244, alignItems: 'center', justifyContent: 'flex-start' }}>
        {shouldRenderBranding && (
          <>
            <Animated.Image
              source={miraLogo}
              style={{
                width: 180,
                height: 180,
                resizeMode: 'contain',
                opacity: logoOpacity,
                transform: [{ translateY: logoTranslateY }],
              }}
            />
            <Animated.View style={{ opacity: textOpacity, marginTop: 12 }}>
              <Text
                style={{
                  fontSize: 32,
                  fontWeight: '700',
                  color: theme.colors.text,
                  letterSpacing: 0.5,
                }}
              >
                Welcome to Mira
              </Text>
            </Animated.View>
          </>
        )}
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search anything..."
        placeholderTextColor={theme.colors.textDim}
        style={{
          width: '100%',
          maxWidth: 400,
          paddingVertical: 14,
          paddingHorizontal: 16,
          fontSize: 17,
          color: theme.colors.text,
          backgroundColor: theme.colors.inputBackground,
          borderRadius: theme.metrics.radius,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={() => {
          if (query.trim()) navigate(query.trim());
        }}
      />
    </View>
  );
}
