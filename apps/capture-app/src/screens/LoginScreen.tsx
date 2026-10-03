/**
 * Member Login Screen for Panchnama AI Capture App.
 * Performs live authentication against Supabase Auth to obtain a verified JWT session token.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../theme.js';
import { setSessionToken } from '../native/session.js';
import { loginWithSupabase } from '../api.js';

interface Props {
  readonly onLoginSuccess: (token: string, email: string, role: string) => void;
  readonly initialEmail?: string | null;
}

export function LoginScreen({ onLoginSuccess, initialEmail }: Props): JSX.Element {
  const [email, setEmail] = useState(initialEmail ?? 'member@panchnama.ai');
  const [password, setPassword] = useState('MemberPass123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAuthenticate(): Promise<void> {
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email address and password');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await loginWithSupabase({ email, password });
      await setSessionToken(result.token);
      onLoginSuccess(result.token, result.userEmail, 'member');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>PANCHNAMA AI</Text>
        </View>
        <Text style={styles.mainTitle}>Field Capture Login</Text>
        <Text style={styles.subTitle}>AUTHENTICATED EVIDENCE PORTAL</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="member@panchnama.ai"
          placeholderTextColor={colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
        />

        {error !== null && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        )}

        <Pressable
          style={[styles.submitButton, loading && styles.buttonDisabled]}
          disabled={loading}
          onPress={() => void handleAuthenticate()}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.textInverted} />
          ) : (
            <Text style={styles.submitButtonText}>Sign In to Workspace</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.footerInfo}>
        <Text style={styles.footerText}>
          🔒 Securing evidence with Supabase JWT & hardware Ed25519 signatures.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  badge: {
    backgroundColor: colors.softAccent,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    color: colors.brandPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  mainTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  subTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.brandSecondary,
    letterSpacing: 1.5,
    marginTop: 4,
  },

  formCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
  },
  errorContainer: {
    backgroundColor: colors.softAccent,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  errorText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: colors.brandPrimary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: colors.textInverted,
    fontWeight: '800',
    fontSize: 14,
  },

  footerInfo: {
    marginTop: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
