import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ModalScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={[styles.iconWrap, { backgroundColor: Colors.primary + '18' }]}>
          <IconSymbol name="shield.fill" size={48} color={Colors.primary} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>About SafeHer</Text>
        <Text style={[styles.desc, { color: theme.textSecondary }]}>
          SafeHer is your personal safety companion — always ready to help you get to safety, alert your loved ones, and provide peace of mind.
        </Text>

        <View style={{ gap: 12, width: '100%' }}>
          {[
            { icon: 'exclamationmark.circle.fill', label: 'One-tap SOS alert', color: Colors.danger },
            { icon: 'phone.fill', label: 'Fake incoming calls', color: Colors.secondary },
            { icon: 'location.fill', label: 'Live location sharing', color: Colors.info },
            { icon: 'shield.fill', label: 'Safe zone tracking', color: Colors.success },
            { icon: 'mic.fill', label: 'Evidence recording', color: Colors.warning },
          ].map(f => (
            <View key={f.label} style={[styles.featureRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.featureIcon, { backgroundColor: f.color + '18' }]}>
                <IconSymbol name={f.icon as any} size={18} color={f.color} />
              </View>
              <Text style={[styles.featureLabel, { color: theme.text }]}>{f.label}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Text style={styles.closeBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, alignItems: 'center', padding: 24, gap: 16 },
  iconWrap: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  desc: { textAlign: 'center', fontSize: 14, lineHeight: 22 },
  featureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1, width: '100%',
  },
  featureIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  featureLabel: { fontSize: 15, fontWeight: '600' },
  closeBtn: {
    marginTop: 'auto',
    backgroundColor: Colors.primary,
    paddingHorizontal: 40, paddingVertical: 14,
    borderRadius: 30,
    shadowColor: Colors.primary,
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 6,
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
