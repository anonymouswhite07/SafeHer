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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useSafeHer } from '@/context/SafeHerContext';
import * as Haptics from 'expo-haptics';
import { startAudioRecording, stopRecording } from '@/services/evidenceService';

const { width } = Dimensions.get('window');

const FAKE_CALLERS = [
    { name: 'Mom 💕', number: '+1 (555) 234-5678' },
    { name: 'Sarah', number: '+1 (555) 876-5432' },
    { name: 'Alex', number: '+1 (555) 111-2222' },
    { name: 'Unknown', number: '+1 (555) 000-0000' },
];

export default function FakeCallScreen() {
    const { contacts, fakeCallEnabled } = useSafeHer();
    const [phase, setPhase] = useState<'incoming' | 'active' | 'ended'>('incoming');
    const [callDuration, setCallDuration] = useState(0);

    const slideAnim = useRef(new Animated.Value(0)).current;
    const ringPulse = useRef(new Animated.Value(1)).current;
    const avatarPulse = useRef(new Animated.Value(1)).current;
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Pick a caller — prefer real contact, fall back to fake
    const caller = contacts.length > 0
        ? { name: contacts[0].name, number: contacts[0].phone }
        : FAKE_CALLERS[Math.floor(Math.random() * FAKE_CALLERS.length)];

    useEffect(() => {
        // Slide in
        Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }).start();

        // Vibrate like a real call
        if (Platform.OS !== 'web') {
            Vibration.vibrate([0, 1000, 500, 1000, 500, 1000], true);
        }

        // Avatar pulse
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(avatarPulse, { toValue: 1.06, duration: 700, useNativeDriver: true }),
                Animated.timing(avatarPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
            ])
        );
        pulse.start();

        // Ring bars
        const ring = Animated.loop(
            Animated.sequence([
                Animated.timing(ringPulse, { toValue: 1.15, duration: 400, useNativeDriver: true }),
                Animated.timing(ringPulse, { toValue: 1, duration: 400, useNativeDriver: true }),
            ])
        );
        ring.start();

        return () => {
            pulse.stop();
            ring.stop();
            Vibration.cancel();
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const handleAnswer = async () => {
        Vibration.cancel();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPhase('active');

        // Secretly start audio recording as evidence when the fake call is answered
        try {
            await startAudioRecording();
        } catch (err) {
            console.warn('[FakeCall] Could not start recording:', err);
        }

        timerRef.current = setInterval(() => {
            setCallDuration(s => s + 1);
        }, 1000);
    };

    const handleDecline = async () => {
        Vibration.cancel();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        await stopRecording();
        router.back();
    };

    const handleEndCall = async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        Vibration.cancel();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

        // Stop the secret background recording when the call ends
        await stopRecording();

        setPhase('ended');
        setTimeout(() => router.back(), 1500);
    };

    const formatDuration = (s: number) => {
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [200, 0] });

    if (phase === 'ended') {
        return (
            <View style={[styles.container, { backgroundColor: '#1A1A2E' }]}>
                <SafeAreaView style={styles.centeredContent}>
                    <IconSymbol name="phone.down.fill" size={48} color={Colors.danger} />
                    <Text style={styles.endedText}>Call Ended</Text>
                </SafeAreaView>
            </View>
        );
    }

    return (
        <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
            <SafeAreaView style={styles.inner}>
                {/* Caller Info */}
                <View style={styles.callerSection}>
                    <Text style={styles.incomingLabel}>
                        {phase === 'incoming' ? 'Incoming Call...' : `Active Call · ${formatDuration(callDuration)}`}
                    </Text>

                    <Animated.View style={[styles.avatarOuter, { transform: [{ scale: avatarPulse }] }]}>
                        <View style={styles.avatarInner}>
                            <Text style={styles.avatarText}>{caller.name.charAt(0).toUpperCase()}</Text>
                        </View>
                    </Animated.View>

                    <Text style={styles.callerName}>{caller.name}</Text>
                    <Text style={styles.callerNumber}>{caller.number}</Text>

                    {phase === 'incoming' && (
                        <Animated.View style={[styles.ringBars, { transform: [{ scale: ringPulse }] }]}>
                            {[...Array(5)].map((_, i) => (
                                <View
                                    key={i}
                                    style={[styles.ringBar, {
                                        height: 6 + i * 5,
                                        opacity: 0.4 + i * 0.12,
                                    }]}
                                />
                            ))}
                        </Animated.View>
                    )}
                </View>

                {/* Actions */}
                {phase === 'incoming' ? (
                    <View style={styles.callActions}>
                        {/* Decline */}
                        <View style={styles.callBtnWrapper}>
                            <TouchableOpacity style={[styles.callBtn, { backgroundColor: Colors.danger }]} onPress={handleDecline}>
                                <IconSymbol name="phone.down.fill" size={32} color="#fff" />
                            </TouchableOpacity>
                            <Text style={styles.callBtnLabel}>Decline</Text>
                        </View>

                        {/* Answer */}
                        <View style={styles.callBtnWrapper}>
                            <TouchableOpacity style={[styles.callBtn, { backgroundColor: Colors.success }]} onPress={handleAnswer}>
                                <IconSymbol name="phone.fill" size={32} color="#fff" />
                            </TouchableOpacity>
                            <Text style={styles.callBtnLabel}>Answer</Text>
                        </View>
                    </View>
                ) : (
                    <View style={styles.activeActions}>
                        {/* Secondary actions */}
                        <View style={styles.secondaryRow}>
                            {['mic.slash.fill', 'speaker.wave.2.fill', 'person.crop.circle.badge.plus'].map((icon, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={styles.secondaryBtn}
                                    onPress={() => Haptics.selectionAsync()}
                                >
                                    <IconSymbol name={icon as any} size={22} color="rgba(255,255,255,0.8)" />
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* End call */}
                        <View style={styles.callBtnWrapper}>
                            <TouchableOpacity
                                style={[styles.callBtn, styles.endCallBtn, { backgroundColor: Colors.danger }]}
                                onPress={handleEndCall}
                            >
                                <IconSymbol name="phone.down.fill" size={32} color="#fff" />
                            </TouchableOpacity>
                            <Text style={styles.callBtnLabel}>End Call</Text>
                        </View>
                    </View>
                )}
            </SafeAreaView>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#1A1A2E' },
    inner: { flex: 1 },
    centeredContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

    callerSection: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 24,
    },

    incomingLabel: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 32,
        letterSpacing: 0.5,
    },
    avatarOuter: {
        width: 130, height: 130, borderRadius: 65,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
    },
    avatarInner: {
        width: 110, height: 110, borderRadius: 55,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { fontSize: 52, fontWeight: '900', color: '#fff' },
    callerName: { color: '#fff', fontSize: 32, fontWeight: '800', marginBottom: 8 },
    callerNumber: { color: 'rgba(255,255,255,0.6)', fontSize: 16, fontWeight: '500', marginBottom: 24 },

    ringBars: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 4,
        marginTop: 12,
    },
    ringBar: {
        width: 5,
        backgroundColor: Colors.success,
        borderRadius: 3,
    },

    callActions: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'flex-start',
        paddingHorizontal: 60,
        paddingBottom: 60,
    },
    callBtnWrapper: { alignItems: 'center', gap: 10 },
    callBtn: {
        width: 78, height: 78, borderRadius: 39,
        alignItems: 'center', justifyContent: 'center',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
    endCallBtn: { shadowColor: Colors.danger },
    callBtnLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },

    activeActions: { alignItems: 'center', paddingBottom: 60, gap: 32 },
    secondaryRow: { flexDirection: 'row', gap: 28 },
    secondaryBtn: {
        width: 60, height: 60, borderRadius: 30,
        backgroundColor: 'rgba(255,255,255,0.12)',
        alignItems: 'center', justifyContent: 'center',
    },

    endedText: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 12 },
});
