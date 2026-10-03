/**
 * Panchnama AI — Media Intelligence Platform Theme Palette
 * Source: Official Panchnama AI Colour Palette Specification
 */

export const colors = {
  // Primary Neutrals
  background: '#FCF9F4',
  surface: '#F7F3EB',
  elevated: '#EEE8DD',
  border: '#E0DACC',
  muted: '#D6CFC1',

  // Text Colours
  textPrimary: '#1F1B16',
  textSecondary: '#5A534A',
  textTertiary: '#8C8276',
  textMuted: '#AEA499',
  textInverted: '#FFFFFF',

  // Brand & Accent
  brandPrimary: '#6B5E49',
  brandSecondary: '#8A775E',
  accent: '#C3946B',
  softAccent: '#EAD9C6',
  highlight: '#F4EDE4',

  // Status Colours
  success: '#2E7D32',
  warning: '#D97706',
  error: '#DC2626',
  info: '#3B82F6',
  statusNeutral: '#6B7280',
} as const;

export type Colors = typeof colors;
