// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * SafeHer extended icon mapping — SF Symbols → Material Icons
 * @see https://icons.expo.fyi for Material Icons reference
 */
const MAPPING = {
  // Navigation
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'chevron.up': 'expand-less',
  'chevron.down': 'expand-more',

  // People & Contacts
  'person.fill': 'person',
  'person.2.fill': 'group',
  'person.badge.plus': 'person-add',
  'person.crop.circle.badge.plus': 'person-add-alt-1',

  // Map & Location
  'map.fill': 'map',
  'location.fill': 'location-on',
  'location.slash.fill': 'location-off',
  'scope': 'my-location',
  'gauge': 'speed',
  'target': 'gps-fixed',

  // Safety & Shield
  'shield.fill': 'security',
  'checkmark.shield.fill': 'verified-user',
  'lock.shield.fill': 'admin-panel-settings',

  // SOS & Emergency
  'exclamationmark.triangle.fill': 'warning',
  'exclamationmark.circle.fill': 'error',
  'waveform.badge.exclamationmark': 'vibration',

  // Phone & Communication
  'phone.fill': 'call',
  'phone.down.fill': 'call-end',
  'phone.arrow.up.right.fill': 'call-made',
  'phone.arrow.down.left.fill': 'call-received',

  // Media & Recording
  'mic.fill': 'mic',
  'mic.slash.fill': 'mic-off',
  'speaker.wave.2.fill': 'volume-up',
  'camera.fill': 'camera-alt',

  // Settings & UI
  'gearshape.fill': 'settings',
  'info.circle.fill': 'info',
  'xmark.circle.fill': 'cancel',
  'checkmark.circle.fill': 'check-circle',
  'plus': 'add',
  'plus.circle.fill': 'add-circle',
  'trash.fill': 'delete',
  'arrow.clockwise': 'refresh',
  'pencil': 'edit',
  'chevron.left': 'chevron-left',
  'bus.fill': 'directions-bus',
  'car.fill': 'directions-car',
  'figure.walk': 'directions-walk',
  'wifi': 'wifi',
  'lightbulb.fill': 'lightbulb',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  const mappedName = MAPPING[name] ?? 'help-outline';
  return <MaterialIcons color={color} size={size} name={mappedName} style={style} />;
}
