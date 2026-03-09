import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Dimensions,
    Vibration,
    Platform,
    Linking,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useSafeHer } from '@/context/SafeHerContext';
import * as Haptics from 'expo-haptics';
import {
    triggerEmergency,
    resolveEmergency,
    isEmergencyActive,
} from '@/services/emergencyService';
import { getCurrentLocation, reverseGeocode } from '@/services/locationService';

const { width } = Dimensions.get('window');

/** Shape of the live location snapshot */
interface LocationSnapshot {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    mapsLink: string;
    address: string;
}

export default function SOSScreen() {
    const { contacts, cancelSOS } = useSafeHer();
    const [countdown, setCountdown] = useState(5);
    const [sent, setSent] = useState(false);

    // ── Emergency result ────────────────────────────────────────────────────────
    const [emergencyResult, setEmergencyResult] = useState<any>(null);
    const [alertSending, setAlertSending] = useState(false);
    const [recordingActive, setRecordingActive] = useState(false);

    // ── Location state ──────────────────────────────────────────────────────────
    const [location, setLocation] = useState<LocationSnapshot | null>(null);
    const [locationLoading, setLocationLoading] = useState(true);
    const [locationError, setLocationError] = useState<string | null>(null);

    // ── Animations ──────────────────────────────────────────────────────────────
    const bgPulse = useRef(new Animated.Value(0)).current;
    const ring1 = useRef(new Animated.Value(1)).current;
    const ring2 = useRef(new Animated.Value(1)).current;
    const sentAnim = useRef(new Animated.Value(0)).current;
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const bgLoopRef = useRef<Animated.CompositeAnimation | null>(null);
    const ringLoopRef = useRef<{ r1: Animated.CompositeAnimation; r2: Animated.CompositeAnimation } | null>(null);

    // ── 1. Fetch location immediately on mount ───────────────────────────────────
    useEffect(() => {
        let active = true;
        setLocationLoading(true);

        getCurrentLocation()
            .then(async (loc) => {
                if (!active) return;
                const address = await reverseGeocode(loc.latitude, loc.longitude);
                setLocation({
                    latitude: loc.latitude,
                    longitude: loc.longitude,
                    accuracy: loc.accuracy,
                    mapsLink: loc.mapsLink,
                    address,
                });
                setLocationLoading(false);
            })
            .catch((err: Error) => {
                if (!active) return;
                setLocationError(err.message ?? 'Unable to retrieve location.');
                setLocationLoading(false);
            });

        return () => { active = false; };
    }, []);

    // ── 2. Animations + vibration + countdown ───────────────────────────────────
    useEffect(() => {
        const bgLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(bgPulse, { toValue: 1, duration: 600, useNativeDriver: false }),
                Animated.timing(bgPulse, { toValue: 0, duration: 600, useNativeDriver: false }),
            ])
        );
        const r1 = Animated.loop(
            Animated.sequence([
                Animated.timing(ring1, { toValue: 2.2, duration: 1200, useNativeDriver: true }),
                Animated.timing(ring1, { toValue: 1, duration: 0, useNativeDriver: true }),
            ])
        );
        const r2 = Animated.loop(
            Animated.sequence([
                Animated.delay(600),
                Animated.timing(ring2, { toValue: 2.2, duration: 1200, useNativeDriver: true }),
                Animated.timing(ring2, { toValue: 1, duration: 0, useNativeDriver: true }),
            ])
        );

        bgLoopRef.current = bgLoop;
        ringLoopRef.current = { r1, r2 };
        bgLoop.start();
        r1.start();
        r2.start();

        if (Platform.OS !== 'web') {
            Vibration.vibrate([0, 400, 200, 400], true);
        }

        let count = 5;
        timerRef.current = setInterval(() => {
            count -= 1;
            setCountdown(count);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            if (count <= 0) {
                clearInterval(timerRef.current!);
                handleSend();
            }
        }, 1000);

        return () => {
            bgLoop.stop();
            r1.stop();
            r2.stop();
            Vibration.cancel();
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    // ── Handlers ─────────────────────────────────────────────────────────────────
    const handleSend = async () => {
        Vibration.cancel();
        setAlertSending(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        // Fire the full emergency pipeline (this handles SMS alert + starts Live Tracking)
        try {
            console.log("EMERGENCY TRIGGERED");
            setRecordingActive(true);
            const result = await triggerEmergency({ triggeredBy: 'SOS_BUTTON' });
            setEmergencyResult(result);
        } catch (err) {
            console.error('[SOSScreen] triggerEmergency failed:', err);
        } finally {
            setAlertSending(false);
        }

        // PUSH UI DIRECTLY TO FAKE SHUTDOWN SCREEN
        router.replace('/fake-shutdown' as any);
    };

    const handleCancel = async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        Vibration.cancel();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (isEmergencyActive()) await resolveEmergency();
        cancelSOS();
        router.back();
    };

    const handleDone = async () => {
        if (isEmergencyActive()) await resolveEmergency();
        cancelSOS();
        router.back();
    };

    const openMapsLink = () => {
        if (location?.mapsLink) {
            Linking.openURL(location.mapsLink).catch(() => { });
        }
    };

    // ── Shared helpers ────────────────────────────────────────────────────────────
    const formatCoord = (val: number) => val.toFixed(6);
    const bgColor = bgPulse.interpolate({
        inputRange: [0, 1],
        outputRange: ['#C93D62', '#EF4444'],
    });

    // ─── SENT SCREEN ──────────────────────────────────────────────────────────────
    if (sent) {
        return (
            <View style={[styles.container, { backgroundColor: '#C93D62' }]}>
                <SafeAreaView style={styles.inner}>
                    <Animated.View style={[styles.sentContainer, { opacity: sentAnim, transform: [{ scale: sentAnim }] }]}>
                        <View style={styles.sentIcon}>
                            <IconSymbol name="checkmark.circle.fill" size={80} color="#fff" />
                        </View>
                        <Text style={styles.sentTitle}>SOS Sent!</Text>
                        <Text style={styles.sentDesc}>
                            {emergencyResult?.contactsAlerted?.length > 0
                                ? `${emergencyResult.contactsAlerted.join(', ')} ${emergencyResult.contactsAlerted.length === 1 ? 'has' : 'have'} been notified.`
                                : contacts.length > 0
                                    ? `${contacts.map((c: any) => c.name).join(', ')} ${contacts.length === 1 ? 'has' : 'have'} been alerted.`
                                    : 'Emergency alert dispatched.'}
                        </Text>

                        {/* Recording active badge */}
                        {recordingActive && (
                            <View style={styles.recordingBadge}>
                                <View style={styles.recordingDot} />
                                <Text style={styles.recordingText}>Evidence Recording Active</Text>
                            </View>
                        )}

                        {/* Location summary card */}
                        {location && (
                            <TouchableOpacity
                                style={styles.locationCard}
                                onPress={openMapsLink}
                                activeOpacity={0.85}
                            >
                                <View style={styles.locationCardHeader}>
                                    <IconSymbol name="location.fill" size={16} color="#fff" />
                                    <Text style={styles.locationCardTitle}>Your Location (attached to alert)</Text>
                                    <View style={styles.tapBadge}>
                                        <Text style={styles.tapBadgeText}>Open Maps</Text>
                                    </View>
                                </View>

                                {location.address ? (
                                    <Text style={styles.locationAddress} numberOfLines={2}>
                                        {location.address}
                                    </Text>
                                ) : null}

                                <View style={styles.coordRow}>
                                    {[
                                        { label: 'LAT', value: formatCoord(location.latitude) },
                                        { label: 'LNG', value: formatCoord(location.longitude) },
                                        { label: 'ACC', value: location.accuracy ? `±${Math.round(location.accuracy)}m` : 'N/A' },
                                    ].map(item => (
                                        <View key={item.label} style={styles.coordChip}>
                                            <Text style={styles.coordLabel}>{item.label}</Text>
                                            <Text style={styles.coordValue}>{item.value}</Text>
                                        </View>
                                    ))}
                                </View>

                                <Text style={styles.mapsLink} numberOfLines={1}>
                                    {location.mapsLink}
                                </Text>
                            </TouchableOpacity>
                        )}

                        {!location && locationError && (
                            <View style={styles.locationErrorCard}>
                                <IconSymbol name="location.slash.fill" size={16} color="rgba(255,255,255,0.7)" />
                                <Text style={styles.locationErrorText}>Location unavailable — {locationError}</Text>
                            </View>
                        )}

                        <Text style={styles.sentDesc2}>Stay calm. Help is on the way. 🙏</Text>

                        <TouchableOpacity
                            style={styles.doneBtn}
                            onPress={handleDone}
                        >
                            <IconSymbol name="checkmark.circle.fill" size={18} color="#EF4444" />
                            <Text style={styles.doneBtnText}>I'm Safe — Go Back</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </SafeAreaView>
            </View>
        );
    }

    // ─── COUNTDOWN SCREEN ─────────────────────────────────────────────────────────
    return (
        <Animated.View style={[styles.container, { backgroundColor: bgColor }]}>
            <SafeAreaView style={styles.inner}>
                {/* Ripple rings */}
                <View style={styles.ringsContainer}>
                    <Animated.View style={[
                        styles.ring,
                        { transform: [{ scale: ring1 }], opacity: ring1.interpolate({ inputRange: [1, 2.2], outputRange: [0.25, 0] }) },
                    ]} />
                    <Animated.View style={[
                        styles.ring,
                        { transform: [{ scale: ring2 }], opacity: ring2.interpolate({ inputRange: [1, 2.2], outputRange: [0.2, 0] }) },
                    ]} />
                </View>

                <Text style={styles.alertTitle}>EMERGENCY SOS</Text>
                <Text style={styles.alertSubtitle}>
                    Alerting{' '}
                    {contacts.length > 0
                        ? `${contacts.length} emergency contact${contacts.length !== 1 ? 's' : ''}`
                        : 'emergency services'}
                </Text>

                {/* Countdown circle */}
                <View style={styles.countdownCircle}>
                    <Text style={styles.countdownNum}>{countdown}</Text>
                    <Text style={styles.countdownLabel}>seconds</Text>
                </View>

                <Text style={styles.sending}>
                    {alertSending ? 'Contacting guardians…' : 'Sending SOS alert…'}
                </Text>

                {/* ── Location fetch status ── */}
                <View style={styles.locationStatus}>
                    {locationLoading ? (
                        <View style={styles.locationRow}>
                            <ActivityIndicator color="rgba(255,255,255,0.8)" size="small" />
                            <Text style={styles.locationStatusText}>Fetching your GPS location…</Text>
                        </View>
                    ) : location ? (
                        <View style={styles.locationRow}>
                            <IconSymbol name="location.fill" size={14} color="#7FFF00" />
                            <Text style={[styles.locationStatusText, { color: '#7FFF00' }]}>
                                GPS locked · {formatCoord(location.latitude)}, {formatCoord(location.longitude)}
                            </Text>
                            {location.accuracy && (
                                <View style={styles.accBadge}>
                                    <Text style={styles.accBadgeText}>±{Math.round(location.accuracy)}m</Text>
                                </View>
                            )}
                        </View>
                    ) : (
                        <View style={styles.locationRow}>
                            <IconSymbol name="location.slash.fill" size={14} color="rgba(255,200,0,0.9)" />
                            <Text style={[styles.locationStatusText, { color: 'rgba(255,200,0,0.9)' }]}>
                                {locationError ?? 'Location unavailable'}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Contacts being notified */}
                {contacts.length > 0 && (
                    <View style={styles.contactsList}>
                        {contacts.map(c => (
                            <View key={c.id} style={styles.contactChip}>
                                <View style={styles.contactDot} />
                                <Text style={styles.contactChipText}>{c.name}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {contacts.length === 0 && (
                    <View style={styles.noContactWarning}>
                        <IconSymbol name="exclamationmark.triangle.fill" size={16} color="rgba(255,255,255,0.7)" />
                        <Text style={styles.noContactText}>
                            No emergency contacts added. Please add contacts in the Contacts tab.
                        </Text>
                    </View>
                )}

                {/* Cancel */}
                <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.85}>
                    <Text style={styles.cancelBtnText}>Cancel SOS</Text>
                </TouchableOpacity>
            </SafeAreaView>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    inner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },

    // Rings
    ringsContainer: {
        position: 'absolute',
        top: '50%', left: '50%',
        transform: [{ translateX: -120 }, { translateY: -120 }],
    },
    ring: {
        position: 'absolute',
        width: 240, height: 240, borderRadius: 120,
        backgroundColor: '#fff',
    },

    // Countdown screen
    alertTitle: {
        color: '#fff', fontSize: 34, fontWeight: '900',
        letterSpacing: 3, textAlign: 'center', marginBottom: 6,
    },
    alertSubtitle: {
        color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '600',
        textAlign: 'center', marginBottom: 32,
    },
    countdownCircle: {
        width: 150, height: 150, borderRadius: 75,
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderWidth: 4, borderColor: 'rgba(255,255,255,0.6)',
        alignItems: 'center', justifyContent: 'center', marginBottom: 22,
    },
    countdownNum: { color: '#fff', fontSize: 64, fontWeight: '900' },
    countdownLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', marginTop: -8 },

    sending: {
        color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '700',
        textAlign: 'center', marginBottom: 14,
    },

    // Location status row
    locationStatus: {
        width: '100%',
        backgroundColor: 'rgba(0,0,0,0.18)',
        borderRadius: 14,
        paddingVertical: 10,
        paddingHorizontal: 14,
        marginBottom: 16,
    },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    locationStatusText: {
        color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600', flex: 1,
    },
    accBadge: {
        backgroundColor: 'rgba(127,255,0,0.2)',
        borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2,
    },
    accBadgeText: { color: '#7FFF00', fontSize: 11, fontWeight: '700' },

    // Contacts
    contactsList: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 8,
        justifyContent: 'center', marginBottom: 20,
    },
    contactChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 30,
    },
    contactDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7FFF00' },
    contactChipText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    noContactWarning: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
        backgroundColor: 'rgba(0,0,0,0.2)', padding: 14,
        borderRadius: 14, marginBottom: 24, width: '100%',
    },
    noContactText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, flex: 1, lineHeight: 20 },

    cancelBtn: {
        backgroundColor: 'rgba(255,255,255,0.22)',
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
        paddingHorizontal: 48, paddingVertical: 17, borderRadius: 50,
        marginTop: 4,
    },
    cancelBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },

    // ── Sent screen ──
    sentContainer: { alignItems: 'center', width: '100%' },
    sentIcon: { marginBottom: 20 },
    sentTitle: { color: '#fff', fontSize: 38, fontWeight: '900', marginBottom: 10 },
    sentDesc: {
        color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '600',
        textAlign: 'center', lineHeight: 24, marginBottom: 16, paddingHorizontal: 8,
    },
    sentDesc2: {
        color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', marginBottom: 24,
    },
    recordingBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 30,
        paddingHorizontal: 16, paddingVertical: 8, marginBottom: 14,
    },
    recordingDot: {
        width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF4444',
    },
    recordingText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' },

    // Location card (on sent screen)
    locationCard: {
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderRadius: 18,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.35)',
    },
    locationCardHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
    },
    locationCardTitle: {
        color: '#fff', fontSize: 13, fontWeight: '700', flex: 1,
    },
    tapBadge: {
        backgroundColor: 'rgba(255,255,255,0.25)',
        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
    },
    tapBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

    locationAddress: {
        color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '500',
        marginBottom: 10, lineHeight: 20,
    },
    coordRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    coordChip: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 10, padding: 8, alignItems: 'center',
    },
    coordLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
    coordValue: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 2 },
    mapsLink: {
        color: 'rgba(255,255,255,0.55)', fontSize: 11,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },

    locationErrorCard: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
        backgroundColor: 'rgba(0,0,0,0.2)', padding: 12,
        borderRadius: 14, marginBottom: 14, width: '100%',
    },
    locationErrorText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, flex: 1, lineHeight: 18 },

    doneBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#fff', borderRadius: 50,
        paddingHorizontal: 36, paddingVertical: 15,
        shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12,
        elevation: 6,
    },
    doneBtnText: { color: '#EF4444', fontSize: 16, fontWeight: '800' },
});
