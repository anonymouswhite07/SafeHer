import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Switch,
    TextInput,
    Alert,
    ActivityIndicator,
    Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSafeHer } from '@/context/SafeHerContext';
import { getContacts } from '@/services/contactService';
import * as Haptics from 'expo-haptics';

interface GuardianContact {
    id: string;
    name: string;
    phone: string;
    createdAt?: number;
}

const AVATAR_PALETTE = [Colors.primary, Colors.secondary, Colors.info];

export default function SettingsScreen() {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];
    const {
        shakeToSOS, setShakeToSOS,
        fakeCallEnabled, setFakeCallEnabled,
        userName, setUserName,
        userPhone, setUserPhone,
        motionActive, lastMotionEvent,
    } = useSafeHer();

    // Pulsing dot for active sensor indicator
    const pulseAnim = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        if (!motionActive) { pulseAnim.setValue(1); return; }
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [motionActive]);

    const [editingName, setEditingName] = useState(false);
    const [editingPhone, setEditingPhone] = useState(false);
    const [nameInput, setNameInput] = useState(userName);
    const [phoneInput, setPhoneInput] = useState(userPhone);

    const [guardians, setGuardians] = useState<GuardianContact[]>([]);
    const [guardiansLoading, setGuardiansLoading] = useState(true);

    // Reload guardians whenever screen is focused (after returning from GuardianSetupScreen)
    useFocusEffect(
        useCallback(() => {
            let active = true;
            setGuardiansLoading(true);
            getContacts().then((data: GuardianContact[]) => {
                if (active) {
                    setGuardians(data);
                    setGuardiansLoading(false);
                }
            });
            return () => { active = false; };
        }, [])
    );

    const saveField = async (field: 'name' | 'phone') => {
        if (field === 'name') {
            await setUserName(nameInput.trim());
            setEditingName(false);
        } else {
            await setUserPhone(phoneInput.trim());
            setEditingPhone(false);
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    const handleToggle = async (key: 'shake' | 'fakeCall', val: boolean) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (key === 'shake') await setShakeToSOS(val);
        else await setFakeCallEnabled(val);
    };

    const SettingRow = ({
        icon, label, desc, color, toggle, value, onToggle, onPress,
    }: {
        icon: string; label: string; desc?: string; color: string;
        toggle?: boolean; value?: boolean; onToggle?: (v: boolean) => void; onPress?: () => void;
    }) => (
        <TouchableOpacity
            style={[styles.settingRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={onPress}
            activeOpacity={toggle ? 1 : 0.7}
        >
            <View style={[styles.settingIcon, { backgroundColor: color + '18' }]}>
                <IconSymbol name={icon as any} size={18} color={color} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: theme.text }]}>{label}</Text>
                {desc && <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>{desc}</Text>}
            </View>
            {toggle ? (
                <Switch
                    value={value}
                    onValueChange={onToggle}
                    trackColor={{ false: theme.border, true: Colors.primary + '80' }}
                    thumbColor={value ? Colors.primary : theme.icon}
                />
            ) : (
                <IconSymbol name="chevron.right" size={16} color={theme.textSecondary} />
            )}
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                <Text style={[styles.title, { color: theme.text }]}>Settings</Text>

                {/* Profile Card */}
                <View style={[styles.profileCard, { backgroundColor: Colors.primary, shadowColor: Colors.primary }]}>
                    <View style={styles.profileAvatar}>
                        <Text style={styles.profileInitial}>
                            {userName ? userName.charAt(0).toUpperCase() : '?'}
                        </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.profileName}>{userName || 'Set your name'}</Text>
                        <Text style={styles.profilePhone}>{userPhone || 'Add your phone number'}</Text>
                    </View>
                    <View style={[styles.guardiansBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                        <Text style={styles.guardiansBadgeText}>{guardians.length}/3 guardians</Text>
                    </View>
                </View>

                {/* Edit Profile */}
                <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>MY PROFILE</Text>
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={styles.editRow}>
                        <IconSymbol name="person.fill" size={16} color={Colors.primary} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.editFieldLabel, { color: theme.textSecondary }]}>Your Name</Text>
                            {editingName ? (
                                <TextInput
                                    style={[styles.editInput, { color: theme.text, borderColor: Colors.primary }]}
                                    value={nameInput}
                                    onChangeText={setNameInput}
                                    autoFocus
                                    onSubmitEditing={() => saveField('name')}
                                    returnKeyType="done"
                                />
                            ) : (
                                <Text style={[styles.editValue, { color: theme.text }]}>{userName || 'Not set'}</Text>
                            )}
                        </View>
                        <TouchableOpacity onPress={() => editingName ? saveField('name') : setEditingName(true)}>
                            <Text style={{ color: Colors.primary, fontWeight: '700', fontSize: 14 }}>
                                {editingName ? 'Save' : 'Edit'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.divider, { backgroundColor: theme.border }]} />

                    <View style={styles.editRow}>
                        <IconSymbol name="phone.fill" size={16} color={Colors.secondary} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.editFieldLabel, { color: theme.textSecondary }]}>Phone Number</Text>
                            {editingPhone ? (
                                <TextInput
                                    style={[styles.editInput, { color: theme.text, borderColor: Colors.secondary }]}
                                    value={phoneInput}
                                    onChangeText={setPhoneInput}
                                    autoFocus
                                    keyboardType="phone-pad"
                                    onSubmitEditing={() => saveField('phone')}
                                    returnKeyType="done"
                                />
                            ) : (
                                <Text style={[styles.editValue, { color: theme.text }]}>{userPhone || 'Not set'}</Text>
                            )}
                        </View>
                        <TouchableOpacity onPress={() => editingPhone ? saveField('phone') : setEditingPhone(true)}>
                            <Text style={{ color: Colors.secondary, fontWeight: '700', fontSize: 14 }}>
                                {editingPhone ? 'Save' : 'Edit'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ─── EMERGENCY GUARDIANS ─── */}
                <View style={styles.sectionRow}>
                    <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: 0, marginBottom: 0 }]}>
                        EMERGENCY GUARDIANS
                    </Text>
                    <TouchableOpacity onPress={() => router.push('/guardian-setup')}>
                        <Text style={{ color: Colors.primary, fontWeight: '700', fontSize: 13 }}>Manage</Text>
                    </TouchableOpacity>
                </View>

                {guardiansLoading ? (
                    <View style={[styles.guardiansLoadCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <ActivityIndicator color={Colors.primary} size="small" />
                        <Text style={[{ fontSize: 13, color: theme.textSecondary }]}>Loading guardians...</Text>
                    </View>
                ) : guardians.length === 0 ? (
                    <TouchableOpacity
                        style={[styles.guardiansEmpty, { backgroundColor: Colors.primary + '0D', borderColor: Colors.primary + '35' }]}
                        onPress={() => router.push('/guardian-setup')}
                    >
                        <View style={[styles.guardiansEmptyIcon, { backgroundColor: Colors.primary + '18' }]}>
                            <IconSymbol name="person.badge.plus" size={24} color={Colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.guardiansEmptyTitle, { color: theme.text }]}>No guardians added</Text>
                            <Text style={[styles.guardiansEmptyDesc, { color: theme.textSecondary }]}>
                                Add up to 3 trusted contacts who will be alerted in an emergency.
                            </Text>
                        </View>
                        <IconSymbol name="chevron.right" size={16} color={Colors.primary} />
                    </TouchableOpacity>
                ) : (
                    <View style={[styles.guardiansCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        {guardians.map((g, i) => {
                            const color = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
                            return (
                                <View key={g.id}>
                                    {i > 0 && <View style={[styles.miniDivider, { backgroundColor: theme.border }]} />}
                                    <View style={styles.guardianRow}>
                                        <View style={[styles.miniSlotBadge, { backgroundColor: color + '18' }]}>
                                            <Text style={[styles.miniSlotNum, { color }]}>{i + 1}</Text>
                                        </View>
                                        <View style={[styles.miniAvatar, { backgroundColor: color + '20' }]}>
                                            <Text style={[styles.miniAvatarText, { color }]}>
                                                {g.name.charAt(0).toUpperCase()}
                                            </Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.guardianName, { color: theme.text }]} numberOfLines={1}>
                                                {g.name}
                                            </Text>
                                            <Text style={[styles.guardianPhone, { color: theme.textSecondary }]}>{g.phone}</Text>
                                        </View>
                                        <View style={[styles.activeBadge, { backgroundColor: Colors.success + '18' }]}>
                                            <View style={[styles.activeDot, { backgroundColor: Colors.success }]} />
                                            <Text style={[styles.activeBadgeText, { color: Colors.success }]}>Active</Text>
                                        </View>
                                    </View>
                                </View>
                            );
                        })}

                        {guardians.length < 3 && (
                            <>
                                <View style={[styles.miniDivider, { backgroundColor: theme.border }]} />
                                <TouchableOpacity
                                    style={styles.addMoreRow}
                                    onPress={() => router.push('/guardian-setup')}
                                >
                                    <View style={[styles.miniAvatar, { backgroundColor: Colors.primary + '15' }]}>
                                        <IconSymbol name="plus" size={16} color={Colors.primary} />
                                    </View>
                                    <Text style={[styles.addMoreText, { color: Colors.primary }]}>
                                        Add guardian ({guardians.length}/3 filled)
                                    </Text>
                                    <IconSymbol name="chevron.right" size={14} color={Colors.primary} />
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                )}

                {/* Guardian Setup navigation row */}
                <SettingRow
                    icon="person.2.fill"
                    label="Guardian Setup Screen"
                    desc="Full management of your emergency guardian contacts"
                    color={Colors.primary}
                    onPress={() => router.push('/guardian-setup')}
                />

                {/* Safety Features */}
                <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>SAFETY FEATURES</Text>
                <SettingRow
                    icon="waveform.badge.exclamationmark"
                    label="Shake to SOS"
                    desc="Shake your phone to instantly trigger SOS"
                    color={Colors.danger}
                    toggle
                    value={shakeToSOS}
                    onToggle={v => handleToggle('shake', v)}
                />

                {/* ── Motion Monitor card ── */}
                {(() => {
                    const sevColor =
                        lastMotionEvent?.severity === 'HIGH' ? Colors.danger :
                            lastMotionEvent?.severity === 'MEDIUM' ? Colors.warning : Colors.success;
                    return (
                        <View style={[styles.motionCard, {
                            backgroundColor: motionActive ? Colors.danger + '08' : theme.surface,
                            borderColor: motionActive ? Colors.danger + '30' : theme.border,
                        }]}>
                            {/* Header */}
                            <View style={styles.motionHeader}>
                                <View style={[styles.motionIconWrap, { backgroundColor: Colors.danger + '15' }]}>
                                    <IconSymbol name="waveform.badge.exclamationmark" size={18} color={Colors.danger} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.motionTitle, { color: theme.text }]}>Motion Monitor</Text>
                                    <Text style={[styles.motionSubtitle, { color: theme.textSecondary }]}>
                                        Accelerometer · shake &amp; impact detection
                                    </Text>
                                </View>
                                <View style={styles.motionStatusRow}>
                                    {motionActive ? (
                                        <>
                                            <Animated.View style={[styles.sensorDot, {
                                                backgroundColor: Colors.success,
                                                opacity: pulseAnim,
                                            }]} />
                                            <Text style={[styles.sensorStatus, { color: Colors.success }]}>ACTIVE</Text>
                                        </>
                                    ) : (
                                        <>
                                            <View style={[styles.sensorDot, { backgroundColor: theme.textSecondary }]} />
                                            <Text style={[styles.sensorStatus, { color: theme.textSecondary }]}>OFF</Text>
                                        </>
                                    )}
                                </View>
                            </View>

                            {/* Last event row */}
                            {lastMotionEvent ? (
                                <View style={[styles.motionEventRow, { backgroundColor: sevColor + '12', borderColor: sevColor + '30' }]}>
                                    <View style={[styles.motionSevBadge, { backgroundColor: sevColor }]}>
                                        <Text style={styles.motionSevText}>{lastMotionEvent.severity}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.motionEventType, { color: theme.text }]}>
                                            {lastMotionEvent.type.replace(/_/g, ' ')}
                                        </Text>
                                        <Text style={[styles.motionEventDesc, { color: theme.textSecondary }]}>
                                            {lastMotionEvent.description}
                                        </Text>
                                    </View>
                                    <View style={styles.motionMagWrap}>
                                        <Text style={[styles.motionMagVal, { color: sevColor }]}>
                                            {lastMotionEvent.magnitude.toFixed(2)}
                                        </Text>
                                        <Text style={[styles.motionMagLabel, { color: theme.textSecondary }]}>G</Text>
                                    </View>
                                </View>
                            ) : (
                                <View style={[styles.motionEventRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
                                    <IconSymbol name="checkmark.circle.fill" size={18} color={Colors.success} />
                                    <Text style={[styles.motionEventDesc, { color: theme.textSecondary, flex: 1, marginLeft: 8 }]}>
                                        {motionActive
                                            ? 'No threats detected — all normal'
                                            : 'Enable \'Shake to SOS\' above to activate'}
                                    </Text>
                                </View>
                            )}

                            {/* Formula note for AI module */}
                            <Text style={[styles.motionFormula, { color: theme.textSecondary }]}>
                                magnitude = √(x² + y² + z²)  ·  thresholds: shake 2.4 G · impact 3.5 G
                            </Text>
                        </View>
                    );
                })()}
                <SettingRow
                    icon="phone.arrow.down.left.fill"
                    label="Fake Incoming Call"
                    desc="Enable fake call feature for escape situations"
                    color={Colors.secondary}
                    toggle
                    value={fakeCallEnabled}
                    onToggle={v => handleToggle('fakeCall', v)}
                />
                <SettingRow
                    icon="location.fill"
                    label="Location Permissions"
                    desc="Required for map and safe zone features"
                    color={Colors.info}
                    onPress={() =>
                        Alert.alert('Location', 'Go to your device Settings > SafeHer > Location to manage permissions.')
                    }
                />

                {/* Evidence */}
                <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>EVIDENCE</Text>
                <SettingRow
                    icon="folder.fill"
                    label="Evidence Vault"
                    desc="View photos and audio from past emergencies"
                    color={Colors.primary}
                    onPress={() => router.push('/evidence-vault' as any)}
                />

                {/* About */}
                <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>ABOUT</Text>
                <SettingRow
                    icon="info.circle.fill"
                    label="About SafeHer"
                    desc="Version 1.0.0"
                    color={Colors.primary}
                    onPress={() => Alert.alert('SafeHer', 'SafeHer v1.0.0\n\nYour safety companion, always by your side.')}
                />
                <SettingRow
                    icon="lock.shield.fill"
                    label="Privacy Policy"
                    desc="Your data never leaves your device"
                    color={Colors.success}
                    onPress={() =>
                        Alert.alert('Privacy', 'All your data is stored only on your device. SafeHer never uploads personal information.')
                    }
                />

                {/* SOS Test */}
                <View style={[styles.testCard, { backgroundColor: Colors.danger + '10', borderColor: Colors.danger + '30' }]}>
                    <IconSymbol name="exclamationmark.triangle.fill" size={20} color={Colors.danger} />
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.testTitle, { color: theme.text }]}>Test SOS Alert</Text>
                        <Text style={[styles.testDesc, { color: theme.textSecondary }]}>
                            Make sure your SOS works before you need it
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.testBtn, { backgroundColor: Colors.danger + '20' }]}
                        onPress={() =>
                            Alert.alert(
                                'SOS Test',
                                guardians.length > 0
                                    ? `✓ In a real emergency, ${guardians.map(g => g.name).join(', ')} would receive your location.`
                                    : 'Add guardian contacts first so they can be alerted when you use SOS!',
                                [{ text: 'Got it' }]
                            )
                        }
                    >
                        <Text style={{ color: Colors.danger, fontWeight: '700', fontSize: 13 }}>Test</Text>
                    </TouchableOpacity>
                </View>

                <View style={{ height: 32 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scroll: { paddingHorizontal: 20, paddingBottom: 40 },
    title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, paddingVertical: 16 },

    profileCard: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 20, borderRadius: 20, marginBottom: 24,
        shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 8,
    },
    profileAvatar: {
        width: 56, height: 56, borderRadius: 28,
        backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center',
    },
    profileInitial: { fontSize: 26, fontWeight: '800', color: '#fff' },
    profileName: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 2 },
    profilePhone: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
    guardiansBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    guardiansBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

    sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10, marginTop: 8 },
    sectionRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 8, marginBottom: 10,
    },
    card: { borderRadius: 16, borderWidth: 1, marginBottom: 20, overflow: 'hidden' },
    editRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
    editFieldLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
    editValue: { fontSize: 16, fontWeight: '600' },
    editInput: { fontSize: 16, fontWeight: '600', borderBottomWidth: 1.5, paddingBottom: 2 },
    divider: { height: 1, marginHorizontal: 16 },

    // Guardian cards
    guardiansLoadCard: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12,
    },
    guardiansEmpty: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 16, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', marginBottom: 12,
    },
    guardiansEmptyIcon: {
        width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
    },
    guardiansEmptyTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
    guardiansEmptyDesc: { fontSize: 12, lineHeight: 18 },
    guardiansCard: { borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
    guardianRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
    miniSlotBadge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    miniSlotNum: { fontSize: 10, fontWeight: '900' },
    miniAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    miniAvatarText: { fontSize: 18, fontWeight: '800' },
    guardianName: { fontSize: 15, fontWeight: '700', marginBottom: 1 },
    guardianPhone: { fontSize: 12 },
    activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
    activeDot: { width: 6, height: 6, borderRadius: 3 },
    activeBadgeText: { fontSize: 11, fontWeight: '700' },
    miniDivider: { height: 1, marginHorizontal: 14 },
    addMoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
    addMoreText: { flex: 1, fontSize: 14, fontWeight: '600' },

    settingRow: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 10,
    },
    settingIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    settingLabel: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
    settingDesc: { fontSize: 12 },

    // Motion monitor card
    motionCard: {
        borderRadius: 18, borderWidth: 1.5,
        padding: 16, marginBottom: 10,
    },
    motionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    motionIconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    motionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 1 },
    motionSubtitle: { fontSize: 11 },
    motionStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    sensorDot: { width: 8, height: 8, borderRadius: 4 },
    sensorStatus: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
    motionEventRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        borderRadius: 12, borderWidth: 1, padding: 10, marginBottom: 10,
    },
    motionSevBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    motionSevText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
    motionEventType: { fontSize: 13, fontWeight: '800', textTransform: 'capitalize', marginBottom: 1 },
    motionEventDesc: { fontSize: 11, lineHeight: 16 },
    motionMagWrap: { alignItems: 'center' },
    motionMagVal: { fontSize: 20, fontWeight: '900' },
    motionMagLabel: { fontSize: 10, fontWeight: '700', marginTop: -2 },
    motionFormula: {
        fontSize: 10, fontFamily: 'monospace',
        textAlign: 'center', opacity: 0.6,
    },

    testCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 16, borderRadius: 16, borderWidth: 1, marginTop: 12,
    },
    testTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
    testDesc: { fontSize: 12 },
    testBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
});
