import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

const TIPS_DATA = [
    {
        category: 'On the Street',
        color: Colors.primary,
        icon: 'figure.walk',
        tips: [
            'Stay aware of your surroundings — limit headphone use in unfamiliar areas.',
            'Walk confidently and make eye contact with people around you.',
            'Stick to well-lit, populated streets, especially at night.',
            'Let someone know your route before traveling alone.',
            'Trust your gut — if something feels wrong, it probably is.',
        ],
    },
    {
        category: 'Public Transport',
        color: Colors.secondary,
        icon: 'bus.fill',
        tips: [
            'Sit near the driver or in busy carriages on trains.',
            'Keep your phone and valuables inside your bag when possible.',
            'Be cautious when strangers seem overly interested in your plans.',
            'Always have a backup plan in case your ride falls through.',
            'Share your trip details with a trusted contact.',
        ],
    },
    {
        category: 'Online Safety',
        color: Colors.info,
        icon: 'wifi',
        tips: [
            'Limit the personal information you share on social media.',
            'Never share your live location publicly.',
            'Use strong, unique passwords and enable two-factor auth.',
            'Be cautious about meeting strangers from online platforms.',
            "Tell someone you trust when you're meeting someone new.",
        ],
    },
    {
        category: 'At Home',
        color: Colors.success,
        icon: 'house.fill',
        tips: [
            "Always lock your door, even when you're home.",
            'Install a peephole or video doorbell.',
            'Be careful about who you let in.',
            'Share your home address only with trusted people.',
            'Have emergency numbers easily accessible.',
        ],
    },
    {
        category: 'In an Emergency',
        color: Colors.danger,
        icon: 'exclamationmark.triangle.fill',
        tips: [
            'Call 911 (or local emergency number) immediately.',
            'Use SafeHer SOS to alert your emergency contacts instantly.',
            'Make noise — scream, use an alarm, or honk a car horn.',
            'Head toward crowded, public places if being followed.',
            'Leave the area first, ask questions later.',
        ],
    },
];

const HELPLINES = [
    { name: 'National Domestic Violence', number: '1-800-799-7233', color: Colors.danger },
    { name: 'Sexual Assault Hotline', number: '1-800-656-4673', color: Colors.primary },
    { name: 'Crisis Text Line', number: 'Text HOME to 741741', color: Colors.secondary },
    { name: 'National Emergency', number: '911', color: Colors.warning },
];

export default function TipsScreen() {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];
    const [expanded, setExpanded] = useState<string | null>('On the Street');

    const toggle = (cat: string) => {
        Haptics.selectionAsync();
        setExpanded(p => (p === cat ? null : cat));
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={[styles.title, { color: theme.text }]}>Safety Tips</Text>
                    <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                        Knowledge is your first line of defense
                    </Text>
                </View>

                {/* Banner */}
                <View style={[styles.banner, { backgroundColor: Colors.primary + '12', borderColor: Colors.primary + '30' }]}>
                    <IconSymbol name="lightbulb.fill" size={22} color={Colors.primary} />
                    <Text style={[styles.bannerText, { color: theme.text }]}>
                        Being prepared and aware can make all the difference. Read these tips and share them with people you care about.
                    </Text>
                </View>

                {/* Tips Accordion */}
                {TIPS_DATA.map(section => (
                    <View key={section.category} style={[styles.accordion, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <TouchableOpacity
                            style={styles.accordionHeader}
                            onPress={() => toggle(section.category)}
                            activeOpacity={0.75}
                        >
                            <View style={[styles.catIcon, { backgroundColor: section.color + '18' }]}>
                                <IconSymbol name={section.icon as any} size={18} color={section.color} />
                            </View>
                            <Text style={[styles.catTitle, { color: theme.text }]}>{section.category}</Text>
                            <View style={styles.tipCount}>
                                <Text style={[styles.tipCountText, { color: section.color }]}>{section.tips.length}</Text>
                            </View>
                            <IconSymbol
                                name={expanded === section.category ? 'chevron.up' : 'chevron.down'}
                                size={16}
                                color={theme.textSecondary}
                            />
                        </TouchableOpacity>

                        {expanded === section.category && (
                            <View style={[styles.accordionBody, { borderTopColor: theme.border }]}>
                                {section.tips.map((tip, i) => (
                                    <View key={i} style={styles.tipRow}>
                                        <View style={[styles.tipBullet, { backgroundColor: section.color }]} />
                                        <Text style={[styles.tipText, { color: theme.text }]}>{tip}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                ))}

                {/* Helplines */}
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Emergency Helplines</Text>
                {HELPLINES.map(h => (
                    <TouchableOpacity
                        key={h.name}
                        style={[styles.helplineCard, { backgroundColor: h.color + '10', borderColor: h.color + '30' }]}
                        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
                        activeOpacity={0.8}
                    >
                        <View style={[styles.helplineIcon, { backgroundColor: h.color + '20' }]}>
                            <IconSymbol name="phone.fill" size={16} color={h.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.helplineName, { color: theme.text }]}>{h.name}</Text>
                            <Text style={[styles.helplineNumber, { color: h.color }]}>{h.number}</Text>
                        </View>
                        <IconSymbol name="phone.arrow.up.right.fill" size={18} color={h.color} />
                    </TouchableOpacity>
                ))}

                <View style={{ height: 32 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scroll: { paddingHorizontal: 20, paddingBottom: 40 },

    header: { paddingVertical: 16 },
    title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, marginBottom: 4 },
    subtitle: { fontSize: 14 },

    banner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 20,
    },
    bannerText: { fontSize: 13, lineHeight: 20, flex: 1, fontWeight: '500' },

    accordion: {
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 12,
        overflow: 'hidden',
    },
    accordionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 16,
    },
    catIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    catTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
    tipCount: {
        paddingHorizontal: 8, paddingVertical: 2,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.06)',
        marginRight: 4,
    },
    tipCountText: { fontSize: 12, fontWeight: '700' },

    accordionBody: {
        borderTopWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 12,
    },
    tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    tipBullet: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
    tipText: { fontSize: 14, lineHeight: 22, flex: 1 },

    sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: 8, marginBottom: 14 },

    helplineCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 10,
    },
    helplineIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    helplineName: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
    helplineNumber: { fontSize: 15, fontWeight: '800' },
});
