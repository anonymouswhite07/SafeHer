import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Alert,
    TextInput,
    Modal,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSafeHer, EmergencyContact } from '@/context/SafeHerContext';
import * as Haptics from 'expo-haptics';

const RELATION_OPTIONS = ['Mom', 'Dad', 'Sister', 'Brother', 'Friend', 'Partner', 'Other'];

export default function ContactsScreen() {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];
    const { contacts, addContact, removeContact } = useSafeHer();

    const [showAdd, setShowAdd] = useState(false);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [relation, setRelation] = useState('Friend');

    const handleAdd = async () => {
        if (!name.trim() || !phone.trim()) {
            Alert.alert('Missing Info', 'Please fill in name and phone number.');
            return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await addContact({ name: name.trim(), phone: phone.trim(), relation });
        setName(''); setPhone(''); setRelation('Friend');
        setShowAdd(false);
    };

    const handleDelete = (contact: EmergencyContact) => {
        Alert.alert(
            'Remove Contact',
            `Remove ${contact.name} from emergency contacts?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                        await removeContact(contact.id);
                    },
                },
            ]
        );
    };

    const AVATAR_COLORS = [Colors.primary, Colors.secondary, Colors.info, Colors.success, Colors.warning];

    const renderContact = ({ item, index }: { item: EmergencyContact; index: number }) => {
        const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
        return (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.avatar, { backgroundColor: avatarColor + '22' }]}>
                    <Text style={[styles.avatarText, { color: avatarColor }]}>
                        {item.name.charAt(0).toUpperCase()}
                    </Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
                    <Text style={[styles.phone, { color: theme.textSecondary }]}>{item.phone}</Text>
                    <View style={[styles.relationBadge, { backgroundColor: avatarColor + '18' }]}>
                        <Text style={[styles.relationText, { color: avatarColor }]}>{item.relation}</Text>
                    </View>
                </View>
                <View style={styles.cardActions}>
                    <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: Colors.info + '15' }]}
                        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                    >
                        <IconSymbol name="phone.fill" size={16} color={Colors.info} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: Colors.danger + '15' }]}
                        onPress={() => handleDelete(item)}
                    >
                        <IconSymbol name="trash.fill" size={16} color={Colors.danger} />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={[styles.title, { color: theme.text }]}>Emergency Contacts</Text>
                    <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                        {contacts.length > 0
                            ? `${contacts.length} contact${contacts.length > 1 ? 's' : ''} saved`
                            : 'Add people who should be alerted'}
                    </Text>
                </View>
                <TouchableOpacity
                    style={styles.addBtn}
                    onPress={() => setShowAdd(true)}
                >
                    <IconSymbol name="plus" size={20} color="#fff" />
                </TouchableOpacity>
            </View>

            {contacts.length === 0 ? (
                <View style={styles.emptyState}>
                    <View style={[styles.emptyIcon, { backgroundColor: Colors.primary + '15' }]}>
                        <IconSymbol name="person.2.fill" size={48} color={Colors.primary} />
                    </View>
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>No Contacts Yet</Text>
                    <Text style={[styles.emptyMsg, { color: theme.textSecondary }]}>
                        Add trusted friends or family members who will be notified in an emergency.
                    </Text>
                    <TouchableOpacity style={styles.addFirstBtn} onPress={() => setShowAdd(true)}>
                        <IconSymbol name="person.badge.plus" size={18} color="#fff" />
                        <Text style={styles.addFirstBtnText}>Add Emergency Contact</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={contacts}
                    renderItem={renderContact}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
                    showsVerticalScrollIndicator={false}
                    ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                    ListFooterComponent={() => (
                        <TouchableOpacity
                            style={[styles.addMoreBtn, { borderColor: Colors.primary + '40' }]}
                            onPress={() => setShowAdd(true)}
                        >
                            <IconSymbol name="plus.circle.fill" size={20} color={Colors.primary} />
                            <Text style={[styles.addMoreText, { color: Colors.primary }]}>Add another contact</Text>
                        </TouchableOpacity>
                    )}
                />
            )}

            {/* Add Contact Modal */}
            <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
                <SafeAreaView style={[styles.modal, { backgroundColor: theme.background }]}>
                    <View style={styles.modalHeader}>
                        <Text style={[styles.modalTitle, { color: theme.text }]}>Add Emergency Contact</Text>
                        <TouchableOpacity onPress={() => setShowAdd(false)}>
                            <IconSymbol name="xmark.circle.fill" size={28} color={theme.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
                        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Full Name *</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                            placeholder="e.g. Sarah Johnson"
                            placeholderTextColor={theme.textSecondary}
                            value={name}
                            onChangeText={setName}
                        />

                        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Phone Number *</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                            placeholder="+1 (555) 000-0000"
                            placeholderTextColor={theme.textSecondary}
                            value={phone}
                            onChangeText={setPhone}
                            keyboardType="phone-pad"
                        />

                        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Relationship</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                {RELATION_OPTIONS.map(r => (
                                    <TouchableOpacity
                                        key={r}
                                        style={[
                                            styles.relationChip,
                                            { borderColor: relation === r ? Colors.primary : theme.border },
                                            relation === r && { backgroundColor: Colors.primary },
                                        ]}
                                        onPress={() => { setRelation(r); Haptics.selectionAsync(); }}
                                    >
                                        <Text style={[
                                            styles.relationChipText,
                                            { color: relation === r ? '#fff' : theme.textSecondary }
                                        ]}>{r}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>

                        <TouchableOpacity style={styles.saveBtn} onPress={handleAdd}>
                            <IconSymbol name="checkmark.circle.fill" size={20} color="#fff" />
                            <Text style={styles.saveBtnText}>Save Contact</Text>
                        </TouchableOpacity>
                        <View style={{ height: 40 }} />
                    </ScrollView>
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
    subtitle: { fontSize: 13, marginTop: 4 },
    addBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: Colors.primary,
        shadowOpacity: 0.35,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 10,
        elevation: 6,
    },

    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 16,
        borderRadius: 18,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
    },
    avatar: {
        width: 50, height: 50, borderRadius: 25,
        alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { fontSize: 22, fontWeight: '800' },
    name: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
    phone: { fontSize: 13, marginBottom: 6 },
    relationBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10, paddingVertical: 3,
        borderRadius: 20,
    },
    relationText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    cardActions: { gap: 8 },
    actionBtn: {
        width: 36, height: 36, borderRadius: 18,
        alignItems: 'center', justifyContent: 'center',
    },

    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    emptyIcon: {
        width: 100, height: 100, borderRadius: 50,
        alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    },
    emptyTitle: { fontSize: 22, fontWeight: '800', marginBottom: 10 },
    emptyMsg: { textAlign: 'center', fontSize: 14, lineHeight: 22, marginBottom: 28 },
    addFirstBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: Colors.primary,
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 30,
        shadowColor: Colors.primary,
        shadowOpacity: 0.35,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 10,
        elevation: 6,
    },
    addFirstBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

    addMoreBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 16,
        marginTop: 10,
        borderRadius: 16,
        borderWidth: 1.5,
        borderStyle: 'dashed',
    },
    addMoreText: { fontSize: 15, fontWeight: '600' },

    modal: { flex: 1 },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    modalTitle: { fontSize: 22, fontWeight: '800' },
    fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
    input: {
        borderWidth: 1.5,
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        marginBottom: 4,
    },
    relationChip: {
        borderWidth: 1.5,
        borderRadius: 30,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    relationChipText: { fontSize: 14, fontWeight: '600' },
    saveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: Colors.primary,
        paddingVertical: 16,
        borderRadius: 16,
        marginTop: 8,
        shadowColor: Colors.primary,
        shadowOpacity: 0.35,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 10,
        elevation: 6,
    },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
