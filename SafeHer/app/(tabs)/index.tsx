import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSafeHer } from '@/context/SafeHerContext';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

const QUICK_ACTIONS = [
  { id: 'fake-call', icon: 'phone.fill', label: 'Fake Call', color: '#7C3AED', route: '/fake-call' as const },
  { id: 'fake-shutdown', icon: 'power', label: 'Fake Shutdown', color: '#EF4444', route: '/fake-shutdown' as const },
  { id: 'trip', icon: 'map.fill', label: 'Safe Route', color: '#10B981', route: '/safe-route' as const },
  { id: 'share', icon: 'location.fill', label: 'Share Location', color: '#0EA5E9', route: null },
];

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const { contacts, activeTrip, startTrip, endTrip, sosActive, triggerSOS } = useSafeHer();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringAnim = useRef(new Animated.Value(1)).current;
  const sosScale = useRef(new Animated.Value(1)).current;
  const [tripActive, setTripActive] = useState(false);
  const [locationShared, setLocationShared] = useState(false);

  // SOS breathe pulse
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    const ring = Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim, { toValue: 1.5, duration: 1500, useNativeDriver: true }),
        Animated.timing(ringAnim, { toValue: 1, duration: 0, useNativeDriver: true }),
      ])
    );
    pulse.start();
    ring.start();
    return () => { pulse.stop(); ring.stop(); };
  }, []);

  const handleSOSPress = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Animated.sequence([
      Animated.timing(sosScale, { toValue: 0.93, duration: 100, useNativeDriver: true }),
      Animated.timing(sosScale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    router.push('/sos');
  };

  const handleQuickAction = (id: string, route: string | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (id === 'fake-call') {
      router.push('/fake-call');
    } else if (id === 'fake-shutdown') {
      router.push('/fake-shutdown' as any);
    } else if (id === 'share') {
      setLocationShared(p => !p);
    } else if (id === 'trip') {
      if (tripActive) {
        endTrip();
        setTripActive(false);
      } else {
        startTrip('My Destination');
        setTripActive(true);
      }
    }
  };

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: theme.textSecondary }]}>{greeting} 👋</Text>
            <Text style={[styles.appTitle, { color: theme.text }]}>SafeHer</Text>
          </View>
          <TouchableOpacity
            style={[styles.profileBtn, { backgroundColor: Colors.primary + '20' }]}
            onPress={() => router.push('/(tabs)/settings')}
          >
            <IconSymbol name="person.fill" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Status Banner */}
        <View style={[styles.statusBanner, {
          backgroundColor: contacts.length > 0 ? Colors.success + '15' : Colors.warning + '15',
          borderColor: contacts.length > 0 ? Colors.success + '40' : Colors.warning + '40',
        }]}>
          <IconSymbol
            name={contacts.length > 0 ? 'checkmark.shield.fill' : 'exclamationmark.triangle.fill'}
            size={16}
            color={contacts.length > 0 ? Colors.success : Colors.warning}
          />
          <Text style={[styles.statusText, { color: contacts.length > 0 ? Colors.success : Colors.warning }]}>
            {contacts.length > 0
              ? `${contacts.length} emergency contact${contacts.length > 1 ? 's' : ''} ready`
              : 'Add emergency contacts to get started'}
          </Text>
        </View>

        {/* Active Trip Banner */}
        {tripActive && (
          <View style={[styles.tripBanner, { backgroundColor: Colors.info + '15', borderColor: Colors.info + '40' }]}>
            <IconSymbol name="car.fill" size={16} color={Colors.info} />
            <Text style={[styles.statusText, { color: Colors.info }]}>Safe trip tracking active</Text>
            <TouchableOpacity onPress={() => { endTrip(); setTripActive(false); }}>
              <Text style={{ color: Colors.danger, fontWeight: '700', fontSize: 13 }}>End</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Big SOS Button */}
        <View style={styles.sosWrapper}>
          {/* Outer ring */}
          <Animated.View style={[
            styles.sosRing2,
            { transform: [{ scale: ringAnim }], opacity: ringAnim.interpolate({ inputRange: [1, 1.5], outputRange: [0.15, 0] }) }
          ]} />
          <Animated.View style={[styles.sosRing1, { transform: [{ scale: pulseAnim }] }]} />

          <Animated.View style={{ transform: [{ scale: sosScale }] }}>
            <TouchableOpacity
              style={styles.sosButton}
              onPress={handleSOSPress}
              activeOpacity={0.85}
            >
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <Text style={styles.sosText}>SOS</Text>
                <Text style={styles.sosSubText}>Hold for help</Text>
              </Animated.View>
            </TouchableOpacity>
          </Animated.View>
        </View>

        <Text style={[styles.sosHint, { color: theme.textSecondary }]}>
          Tap SOS to alert your emergency contacts
        </Text>

        {/* Quick Actions */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Quick Actions</Text>
        <View style={styles.quickGrid}>
          {QUICK_ACTIONS.map(action => {
            const isActive =
              (action.id === 'share' && locationShared) ||
              (action.id === 'trip' && tripActive);
            return (
              <TouchableOpacity
                key={action.id}
                style={[
                  styles.quickCard,
                  { backgroundColor: theme.surface, borderColor: isActive ? action.color : theme.border },
                ]}
                onPress={() => handleQuickAction(action.id, action.route)}
                activeOpacity={0.75}
              >
                <View style={[styles.quickIcon, { backgroundColor: action.color + '18' }]}>
                  <IconSymbol name={action.icon as any} size={22} color={action.color} />
                </View>
                <Text style={[styles.quickLabel, { color: theme.text }]}>{action.label}</Text>
                {isActive && (
                  <View style={[styles.activeDot, { backgroundColor: action.color }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Emergency Contacts Preview */}
        <View style={styles.sectionRow}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Emergency Contacts</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/contacts')}>
            <Text style={{ color: Colors.primary, fontWeight: '600', fontSize: 14 }}>See all</Text>
          </TouchableOpacity>
        </View>

        {contacts.length === 0 ? (
          <TouchableOpacity
            style={[styles.emptyContacts, { backgroundColor: Colors.primary + '10', borderColor: Colors.primary + '30' }]}
            onPress={() => router.push('/add-contact')}
          >
            <IconSymbol name="person.badge.plus" size={28} color={Colors.primary} />
            <Text style={[styles.emptyContactsText, { color: Colors.primary }]}>
              Add your first emergency contact
            </Text>
          </TouchableOpacity>
        ) : (
          contacts.slice(0, 3).map(c => (
            <View key={c.id} style={[styles.contactRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.contactAvatar, { backgroundColor: Colors.primary + '20' }]}>
                <Text style={[styles.contactInitial, { color: Colors.primary }]}>
                  {c.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.contactName, { color: theme.text }]}>{c.name}</Text>
                <Text style={[styles.contactPhone, { color: theme.textSecondary }]}>{c.phone}</Text>
              </View>
              <View style={[styles.contactRelation, { backgroundColor: Colors.primary + '15' }]}>
                <Text style={[styles.contactRelationText, { color: Colors.primary }]}>{c.relation}</Text>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greeting: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  appTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  profileBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },

  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  tripBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    justifyContent: 'space-between',
  },
  statusText: { fontSize: 13, fontWeight: '600', flex: 1 },

  sosWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 6,
    height: 240,
  },
  sosRing2: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: Colors.danger,
  },
  sosRing1: {
    position: 'absolute',
    width: 195,
    height: 195,
    borderRadius: 98,
    backgroundColor: Colors.danger + '25',
  },
  sosButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.danger,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  sosText: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  sosSubText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: -4,
  },
  sosHint: { textAlign: 'center', fontSize: 13, marginBottom: 28 },

  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 28,
  },
  quickCard: {
    width: (width - 52) / 2,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    position: 'relative',
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickLabel: { fontSize: 14, fontWeight: '700' },
  activeDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  emptyContacts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginBottom: 28,
  },
  emptyContactsText: { fontSize: 14, fontWeight: '600', flex: 1 },

  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  contactAvatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  contactInitial: { fontSize: 18, fontWeight: '800' },
  contactName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  contactPhone: { fontSize: 12 },
  contactRelation: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  contactRelationText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});
