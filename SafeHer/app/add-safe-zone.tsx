import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSafeHer } from '@/context/SafeHerContext';
import AsyncStorage from '@/services/storageService';
import * as Haptics from 'expo-haptics';

const SAFE_ZONES_KEY = '@safeher_safe_zones';

interface SafeZone {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius: number;
    createdAt: number;
}

export default function AddSafeZoneScreen() {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];

    const [zoneName, setZoneName] = useState('');
    const [saving, setSaving] = useState(false);

    // Common preset zone names
    const PRESETS = ['Home', 'Work', 'School', 'Gym', 'Family', 'Friend\'s Place'];

    const handleSave = async () => {
        const trimmed = zoneName.trim();
        if (!trimmed) {
            Alert.alert('Missing Name', 'Please enter a name for this safe zone.');
            return;
        }

        setSaving(true);
        try {
            // Load existing zones
            const raw = await AsyncStorage.getItem(SAFE_ZONES_KEY);
            const existing: SafeZone[] = raw ? JSON.parse(raw) : [];

            const newZone: SafeZone = {
                id: Date.now().toString(),
                name: trimmed,
                latitude: 0,   // Will be updated when the user pins from the Map screen
                longitude: 0,
                radius: 100,
                createdAt: Date.now(),
            };

            await AsyncStorage.setItem(
                SAFE_ZONES_KEY,
                JSON.stringify([...existing, newZone])
            );

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert(
                'Safe Zone Added',
                `"${trimmed}" has been saved. Open the Map tab to pin its exact location.`,
                [{ text: 'Done', onPress: () => router.back() }]
            );
        } catch (err: any) {
            Alert.alert('Error', err.message ?? 'Could not save safe zone.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity
                            onPress={() => router.back()}
                            style={styles.backBtn}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <IconSymbol name="chevron.left" size={20} color={theme.text} />
                        </TouchableOpacity>
                        <Text style={[styles.title, { color: theme.text }]}>Add Safe Zone</Text>
                    </View>

                    {/* Icon */}
                    <View style={[styles.iconWrap, { backgroundColor: Colors.success + '18' }]}>
                        <IconSymbol name="shield.fill" size={40} color={Colors.success} />
                    </View>

                    <Text style={[styles.desc, { color: theme.textSecondary }]}>
                        Safe zones are locations where you feel secure. The app can notify your
                        guardians whenever you arrive or leave a safe zone.
                    </Text>

                    {/* Name field */}
                    <View style={[styles.fieldCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <View style={styles.fieldRow}>
                            <IconSymbol name="mappin.and.ellipse" size={16} color={Colors.success} />
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Zone Name</Text>
                                <TextInput
                                    style={[styles.fieldInput, { color: theme.text }]}
                                    placeholder="e.g. Home, Work, School"
                                    placeholderTextColor={theme.textSecondary}
                                    value={zoneName}
                                    onChangeText={setZoneName}
                                    autoCapitalize="words"
                                    returnKeyType="done"
                                    onSubmitEditing={handleSave}
                                    autoFocus
                                />
                            </View>
                        </View>
                    </View>

                    {/* Preset chips */}
                    <Text style={[styles.presetsLabel, { color: theme.textSecondary }]}>QUICK PRESETS</Text>
                    <View style={styles.presets}>
                        {PRESETS.map(preset => (
                            <TouchableOpacity
                                key={preset}
                                style={[
                                    styles.presetChip,
                                    {
                                        backgroundColor: zoneName === preset ? Colors.success + '20' : theme.surface,
                                        borderColor: zoneName === preset ? Colors.success + '60' : theme.border,
                                    },
                                ]}
                                onPress={() => {
                                    Haptics.selectionAsync();
                                    setZoneName(preset);
                                }}
                            >
                                <Text style={[
                                    styles.presetChipText,
                                    { color: zoneName === preset ? Colors.success : theme.text },
                                ]}>
                                    {preset}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Location note */}
                    <View style={[styles.noteBanner, { backgroundColor: Colors.info + '12', borderColor: Colors.info + '30' }]}>
                        <IconSymbol name="info.circle.fill" size={15} color={Colors.info} />
                        <Text style={[styles.noteText, { color: theme.text }]}>
                            After saving, open the Map tab to pin the exact location on the map.
                        </Text>
                    </View>

                    {/* Save button */}
                    <TouchableOpacity
                        style={[styles.saveBtn, { backgroundColor: Colors.success, opacity: saving ? 0.7 : 1 }]}
                        onPress={handleSave}
                        disabled={saving}
                    >
                        <IconSymbol name="checkmark.circle.fill" size={18} color="#fff" />
                        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Safe Zone'}</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scroll: { paddingHorizontal: 24, paddingBottom: 40 },

    header: {
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16,
    },
    backBtn: {
        width: 36, height: 36, borderRadius: 18,
        alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },

    iconWrap: {
        width: 80, height: 80, borderRadius: 40,
        alignItems: 'center', justifyContent: 'center',
        alignSelf: 'center', marginVertical: 20,
    },
    desc: {
        fontSize: 14, lineHeight: 22, textAlign: 'center',
        marginBottom: 28, paddingHorizontal: 8,
    },

    fieldCard: {
        borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 20,
    },
    fieldRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16,
    },
    fieldLabel: {
        fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3,
    },
    fieldInput: { fontSize: 16, fontWeight: '600' },

    presetsLabel: {
        fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10,
    },
    presets: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20,
    },
    presetChip: {
        paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: 20, borderWidth: 1.5,
    },
    presetChipText: { fontSize: 13, fontWeight: '700' },

    noteBanner: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
        borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 24,
    },
    noteText: { fontSize: 12, lineHeight: 18, flex: 1 },

    saveBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        paddingVertical: 16, borderRadius: 16,
        shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4,
    },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
