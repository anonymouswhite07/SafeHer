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
import { saveContact } from '@/services/contactService';
import * as Haptics from 'expo-haptics';

export default function AddContactScreen() {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];

    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        const trimmedName = name.trim();
        const trimmedPhone = phone.trim();

        if (!trimmedName) {
            Alert.alert('Missing Name', 'Please enter the contact\'s name.');
            return;
        }
        if (!trimmedPhone) {
            Alert.alert('Missing Phone', 'Please enter a phone number.');
            return;
        }

        setSaving(true);
        try {
            await saveContact({ name: trimmedName, phone: trimmedPhone });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
        } catch (err: any) {
            Alert.alert('Error', err.message ?? 'Could not save contact. Please try again.');
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
                        <Text style={[styles.title, { color: theme.text }]}>Add Guardian</Text>
                    </View>

                    {/* Icon */}
                    <View style={[styles.iconWrap, { backgroundColor: Colors.primary + '18' }]}>
                        <IconSymbol name="person.badge.plus" size={40} color={Colors.primary} />
                    </View>

                    <Text style={[styles.desc, { color: theme.textSecondary }]}>
                        This person will receive an SMS alert with your location when you trigger SOS.
                    </Text>

                    {/* Name field */}
                    <View style={[styles.fieldCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <View style={styles.fieldRow}>
                            <IconSymbol name="person.fill" size={16} color={Colors.primary} />
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Full Name</Text>
                                <TextInput
                                    style={[styles.fieldInput, { color: theme.text }]}
                                    placeholder="e.g. Jane Doe"
                                    placeholderTextColor={theme.textSecondary}
                                    value={name}
                                    onChangeText={setName}
                                    autoCapitalize="words"
                                    returnKeyType="next"
                                />
                            </View>
                        </View>

                        <View style={[styles.divider, { backgroundColor: theme.border }]} />

                        {/* Phone field */}
                        <View style={styles.fieldRow}>
                            <IconSymbol name="phone.fill" size={16} color={Colors.secondary} />
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Phone Number</Text>
                                <TextInput
                                    style={[styles.fieldInput, { color: theme.text }]}
                                    placeholder="e.g. +44 7700 900000"
                                    placeholderTextColor={theme.textSecondary}
                                    value={phone}
                                    onChangeText={setPhone}
                                    keyboardType="phone-pad"
                                    returnKeyType="done"
                                    onSubmitEditing={handleSave}
                                />
                            </View>
                        </View>
                    </View>

                    {/* Save button */}
                    <TouchableOpacity
                        style={[styles.saveBtn, { backgroundColor: Colors.primary, opacity: saving ? 0.7 : 1 }]}
                        onPress={handleSave}
                        disabled={saving}
                    >
                        <IconSymbol name="checkmark.circle.fill" size={18} color="#fff" />
                        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Guardian'}</Text>
                    </TouchableOpacity>

                    {/* Or go to full management */}
                    <TouchableOpacity
                        style={[styles.manageBtn, { borderColor: theme.border }]}
                        onPress={() => router.replace('/guardian-setup')}
                    >
                        <Text style={[styles.manageBtnText, { color: Colors.primary }]}>
                            Manage all guardians →
                        </Text>
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
    divider: { height: 1, marginHorizontal: 16 },

    saveBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        paddingVertical: 16, borderRadius: 16, marginBottom: 14,
        shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4,
    },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

    manageBtn: {
        alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1,
    },
    manageBtnText: { fontSize: 14, fontWeight: '700' },
});
