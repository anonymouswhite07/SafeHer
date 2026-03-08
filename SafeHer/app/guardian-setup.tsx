import React, { useState, useEffect, useCallback } from 'react';

/** Shape of a persisted guardian contact */
interface GuardianContact {
    id: string;
    name: string;
    phone: string;
    createdAt?: number;
}

interface FeedbackState {
    message: string;
    type: 'success' | 'error' | 'info';
}
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    FlatList,
    Alert,
    Keyboard,
    ActivityIndicator,
    Animated,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
    getContacts,
    saveContact,
    deleteContact,
} from '@/services/contactService';

const MAX_CONTACTS = 3;
const { width } = Dimensions.get('window');

const AVATAR_PALETTE = [
    Colors.primary,
    Colors.secondary,
    Colors.info,
    Colors.success,
    Colors.warning,
];

/** Small animated feedback banner */
function FeedbackBanner({ message, type }: { message: string; type: FeedbackState['type'] }) {
    const slideAnim = React.useRef(new Animated.Value(-60)).current;

    useEffect(() => {
        Animated.sequence([
            Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
            Animated.delay(2200),
            Animated.timing(slideAnim, { toValue: -60, duration: 280, useNativeDriver: true }),
        ]).start();
    }, []);

    const bg = type === 'success' ? Colors.success : type === 'error' ? Colors.danger : Colors.info;

    return (
        <Animated.View style={[styles.banner, { backgroundColor: bg, transform: [{ translateY: slideAnim }] }]}>
            <IconSymbol
                name={type === 'success' ? 'checkmark.circle.fill' : 'exclamationmark.circle.fill'}
                size={16}
                color="#fff"
            />
            <Text style={styles.bannerText}>{message}</Text>
        </Animated.View>
    );
}

export default function GuardianSetupScreen() {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];

    const [contacts, setContacts] = useState<GuardianContact[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Form state
    const [editingContact, setEditingContact] = useState<GuardianContact | null>(null);
    const [nameInput, setNameInput] = useState('');
    const [phoneInput, setPhoneInput] = useState('');
    const [formVisible, setFormVisible] = useState(false);

    // Feedback banner
    const [feedback, setFeedback] = useState<FeedbackState | null>(null);
    const [feedbackKey, setFeedbackKey] = useState(0);

    // ─── Load contacts ──────────────────────────────────────────────────────────
    const loadContacts = useCallback(async () => {
        setLoading(true);
        const loaded = await getContacts();
        setContacts(loaded);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadContacts();
    }, [loadContacts]);

    // ─── Show feedback banner ────────────────────────────────────────────────────
    const showFeedback = (message: string, type: FeedbackState['type'] = 'success') => {
        setFeedback({ message, type });
        setFeedbackKey((k) => k + 1);
    };

    // ─── Open form ──────────────────────────────────────────────────────────────
    const openAddForm = () => {
        if (contacts.length >= MAX_CONTACTS) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            showFeedback(`Maximum ${MAX_CONTACTS} guardian contacts allowed.`, 'error');
            return;
        }
        setEditingContact(null);
        setNameInput('');
        setPhoneInput('');
        setFormVisible(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const openEditForm = (contact: GuardianContact) => {
        setEditingContact(contact);
        setNameInput(contact.name);
        setPhoneInput(contact.phone);
        setFormVisible(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const closeForm = () => {
        Keyboard.dismiss();
        setFormVisible(false);
        setEditingContact(null);
        setNameInput('');
        setPhoneInput('');
    };

    // ─── Save ────────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        Keyboard.dismiss();
        setSaving(true);
        const result = await saveContact({
            ...(editingContact ? { id: editingContact.id } : {}),
            name: nameInput,
            phone: phoneInput,
        });
        setSaving(false);

        if (result.success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setContacts(result.contacts);
            showFeedback(editingContact ? 'Contact updated!' : 'Guardian contact saved!', 'success');
            closeForm();
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            showFeedback(result.message, 'error');
        }
    };

    // ─── Delete ──────────────────────────────────────────────────────────────────
    const handleDelete = (contact: GuardianContact) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert(
            'Remove Guardian',
            `Remove "${contact.name}" from your guardian contacts?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        const result = await deleteContact(contact.id);
                        if (result.success) {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            setContacts(result.contacts);
                            showFeedback(`${contact.name} removed.`, 'success');
                        } else {
                            showFeedback(result.message, 'error');
                        }
                    },
                },
            ]
        );
    };

    // ─── Contact Card ─────────────────────────────────────────────────────────────
    const renderContact = ({ item, index }: { item: GuardianContact; index: number }) => {
        const color = AVATAR_PALETTE[index % AVATAR_PALETTE.length];
        const createdDate = item.createdAt
            ? new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : null;

        return (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                {/* Slot number badge */}
                <View style={[styles.slotBadge, { backgroundColor: color + '18' }]}>
                    <Text style={[styles.slotNum, { color }]}>{index + 1}</Text>
                </View>

                {/* Avatar */}
                <View style={[styles.avatar, { backgroundColor: color + '22' }]}>
                    <Text style={[styles.avatarText, { color }]}>
                        {item.name.charAt(0).toUpperCase()}
                    </Text>
                </View>

                {/* Info */}
                <View style={styles.cardInfo}>
                    <Text style={[styles.contactName, { color: theme.text }]} numberOfLines={1}>
                        {item.name}
                    </Text>
                    <View style={styles.phoneRow}>
                        <IconSymbol name="phone.fill" size={12} color={theme.textSecondary} />
                        <Text style={[styles.contactPhone, { color: theme.textSecondary }]}>
                            {item.phone}
                        </Text>
                    </View>
                    {createdDate && (
                        <Text style={[styles.createdDate, { color: theme.textSecondary }]}>
                            Added {createdDate}
                        </Text>
                    )}
                </View>

                {/* Actions */}
                <View style={styles.cardActions}>
                    <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: Colors.info + '15' }]}
                        onPress={() => openEditForm(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <IconSymbol name="pencil" size={15} color={Colors.info} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: Colors.danger + '15' }]}
                        onPress={() => handleDelete(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <IconSymbol name="trash.fill" size={15} color={Colors.danger} />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    // ─── Slot indicators ──────────────────────────────────────────────────────────
    const SlotIndicators = () => (
        <View style={styles.slotsRow}>
            {[...Array(MAX_CONTACTS)].map((_, i) => {
                const filled = i < contacts.length;
                const color = AVATAR_PALETTE[i];
                return (
                    <View
                        key={i}
                        style={[
                            styles.slot,
                            {
                                backgroundColor: filled ? color + '18' : theme.surface,
                                borderColor: filled ? color + '50' : theme.border,
                            },
                        ]}
                    >
                        <IconSymbol
                            name={filled ? 'person.fill' : 'person.badge.plus'}
                            size={18}
                            color={filled ? color : theme.textSecondary}
                        />
                        <Text style={[styles.slotLabel, { color: filled ? color : theme.textSecondary }]}>
                            {filled ? contacts[i].name.split(' ')[0] : `Slot ${i + 1}`}
                        </Text>
                    </View>
                );
            })}
        </View>
    );

    // ─── Render ───────────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Feedback Banner */}
            {feedback && (
                <FeedbackBanner key={feedbackKey} message={feedback.message} type={feedback.type} />
            )}

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        style={[styles.backBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                        onPress={() => router.back()}
                    >
                        <IconSymbol name="chevron.left" size={18} color={theme.text} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.screenTitle, { color: theme.text }]}>Guardian Setup</Text>
                        <Text style={[styles.screenSubtitle, { color: theme.textSecondary }]}>
                            Who should we alert in an emergency?
                        </Text>
                    </View>
                    {!formVisible && contacts.length < MAX_CONTACTS && (
                        <TouchableOpacity style={styles.addHeaderBtn} onPress={openAddForm}>
                            <IconSymbol name="plus" size={20} color="#fff" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Slot Overview */}
                <View style={styles.section}>
                    <SlotIndicators />
                    <Text style={[styles.slotCaption, { color: theme.textSecondary }]}>
                        {contacts.length}/{MAX_CONTACTS} guardian slots filled
                    </Text>
                </View>

                {/* ── ADD / EDIT FORM ── */}
                {formVisible && (
                    <View style={[styles.formCard, { backgroundColor: theme.surface, borderColor: Colors.primary + '40' }]}>
                        <View style={styles.formHeader}>
                            <View style={[styles.formIconWrap, { backgroundColor: Colors.primary + '18' }]}>
                                <IconSymbol
                                    name={editingContact ? 'pencil' : 'person.badge.plus'}
                                    size={18}
                                    color={Colors.primary}
                                />
                            </View>
                            <Text style={[styles.formTitle, { color: theme.text }]}>
                                {editingContact ? 'Edit Guardian' : 'Add Guardian Contact'}
                            </Text>
                            <TouchableOpacity onPress={closeForm} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <IconSymbol name="xmark.circle.fill" size={24} color={theme.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {/* Name */}
                        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Full Name *</Text>
                        <View style={[styles.inputWrapper, { borderColor: nameInput ? Colors.primary : theme.border, backgroundColor: theme.background }]}>
                            <IconSymbol name="person.fill" size={16} color={nameInput ? Colors.primary : theme.textSecondary} />
                            <TextInput
                                style={[styles.input, { color: theme.text }]}
                                placeholder="e.g. Emma Johnson"
                                placeholderTextColor={theme.textSecondary}
                                value={nameInput}
                                onChangeText={setNameInput}
                                autoCapitalize="words"
                                returnKeyType="next"
                            />
                        </View>

                        {/* Phone */}
                        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Phone Number *</Text>
                        <View style={[styles.inputWrapper, { borderColor: phoneInput ? Colors.primary : theme.border, backgroundColor: theme.background }]}>
                            <IconSymbol name="phone.fill" size={16} color={phoneInput ? Colors.primary : theme.textSecondary} />
                            <TextInput
                                style={[styles.input, { color: theme.text }]}
                                placeholder="+1 (555) 000-0000"
                                placeholderTextColor={theme.textSecondary}
                                value={phoneInput}
                                onChangeText={setPhoneInput}
                                keyboardType="phone-pad"
                                returnKeyType="done"
                                onSubmitEditing={handleSave}
                            />
                        </View>

                        {/* Buttons */}
                        <View style={styles.formActions}>
                            <TouchableOpacity
                                style={[styles.cancelBtn, { borderColor: theme.border }]}
                                onPress={closeForm}
                            >
                                <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.saveBtn, { opacity: saving ? 0.7 : 1 }]}
                                onPress={handleSave}
                                disabled={saving}
                            >
                                {saving ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <>
                                        <IconSymbol name="checkmark.circle.fill" size={17} color="#fff" />
                                        <Text style={styles.saveBtnText}>
                                            {editingContact ? 'Update' : 'Save Guardian'}
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* ── CONTACTS LIST ── */}
                {loading ? (
                    <View style={styles.loadingWrap}>
                        <ActivityIndicator color={Colors.primary} size="large" />
                        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading contacts...</Text>
                    </View>
                ) : contacts.length === 0 && !formVisible ? (
                    <View style={styles.emptyState}>
                        <View style={[styles.emptyIcon, { backgroundColor: Colors.primary + '12' }]}>
                            <IconSymbol name="person.2.fill" size={52} color={Colors.primary} />
                        </View>
                        <Text style={[styles.emptyTitle, { color: theme.text }]}>No Guardians Yet</Text>
                        <Text style={[styles.emptyMsg, { color: theme.textSecondary }]}>
                            Add up to 3 people you trust. They'll be alerted with your location when you trigger SOS.
                        </Text>
                        <TouchableOpacity style={styles.emptyAddBtn} onPress={openAddForm}>
                            <IconSymbol name="person.badge.plus" size={18} color="#fff" />
                            <Text style={styles.emptyAddBtnText}>Add First Guardian</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <FlatList
                        data={contacts}
                        renderItem={renderContact}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                    />
                )}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },

    // Feedback Banner
    banner: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 14,
    },
    bannerText: { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 8,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1,
    },
    screenTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
    screenSubtitle: { fontSize: 13, marginTop: 1 },
    addHeaderBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: Colors.primary,
        shadowOpacity: 0.35,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 10,
        elevation: 6,
    },

    // Slot overview
    section: { paddingHorizontal: 20, marginBottom: 8 },
    slotsRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
    slot: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1.5,
        gap: 4,
    },
    slotLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
    slotCaption: { fontSize: 12, fontWeight: '500', textAlign: 'center', marginBottom: 4 },

    // Form card
    formCard: {
        marginHorizontal: 20,
        marginBottom: 16,
        borderRadius: 20,
        borderWidth: 1.5,
        padding: 18,
        shadowColor: Colors.primary,
        shadowOpacity: 0.08,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 12,
        elevation: 4,
    },
    formHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16,
    },
    formIconWrap: {
        width: 36, height: 36, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    formTitle: { flex: 1, fontSize: 16, fontWeight: '800' },

    fieldLabel: {
        fontSize: 11, fontWeight: '700',
        textTransform: 'uppercase', letterSpacing: 0.7,
        marginBottom: 7, marginTop: 4,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1.5,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 6,
    },
    input: { flex: 1, fontSize: 16, fontWeight: '500' },

    formActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    cancelBtn: {
        flex: 1,
        borderWidth: 1.5,
        borderRadius: 14,
        paddingVertical: 13,
        alignItems: 'center',
    },
    cancelBtnText: { fontSize: 15, fontWeight: '700' },
    saveBtn: {
        flex: 2,
        backgroundColor: Colors.primary,
        borderRadius: 14,
        paddingVertical: 13,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        shadowColor: Colors.primary,
        shadowOpacity: 0.3,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 8,
        elevation: 5,
    },
    saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

    // Loading
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingText: { fontSize: 14 },

    // Empty state
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    emptyIcon: {
        width: 108, height: 108, borderRadius: 54,
        alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    },
    emptyTitle: { fontSize: 22, fontWeight: '800', marginBottom: 10 },
    emptyMsg: { textAlign: 'center', fontSize: 14, lineHeight: 22, marginBottom: 28 },
    emptyAddBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: Colors.primary,
        paddingHorizontal: 28,
        paddingVertical: 15,
        borderRadius: 30,
        shadowColor: Colors.primary,
        shadowOpacity: 0.35,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 10,
        elevation: 6,
    },
    emptyAddBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

    // Contact List
    listContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4 },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 18,
        borderWidth: 1,
        padding: 14,
        gap: 12,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
        position: 'relative',
    },
    slotBadge: {
        position: 'absolute',
        top: -1, left: -1,
        width: 22, height: 22, borderRadius: 11,
        alignItems: 'center', justifyContent: 'center',
    },
    slotNum: { fontSize: 11, fontWeight: '900' },
    avatar: {
        width: 52, height: 52, borderRadius: 26,
        alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { fontSize: 24, fontWeight: '900' },
    cardInfo: { flex: 1 },
    contactName: { fontSize: 16, fontWeight: '800', marginBottom: 3 },
    phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
    contactPhone: { fontSize: 13, fontWeight: '500' },
    createdDate: { fontSize: 11, fontWeight: '500' },
    cardActions: { gap: 8 },
    actionBtn: {
        width: 36, height: 36, borderRadius: 18,
        alignItems: 'center', justifyContent: 'center',
    },
});
