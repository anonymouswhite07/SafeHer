import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    TextInput,
    Animated,
    Dimensions,
    Linking,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import * as Haptics from 'expo-haptics';
import { getRoutes, getRouteSummary } from '@/services/routeService';
import { getCurrentLocation, getLastKnownLocation } from '@/services/locationService';

const { width } = Dimensions.get('window');
const MAP_HEIGHT = 220;

// ── Safety level config ────────────────────────────────────────────────────────
const LEVEL_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
    SAFE: { color: Colors.success, icon: 'shield.fill', label: 'Safe' },
    MODERATE: { color: Colors.warning, icon: 'exclamationmark.shield.fill', label: 'Moderate' },
    CAUTION: { color: '#FF8C00', icon: 'exclamationmark.triangle.fill', label: 'Caution' },
    UNSAFE: { color: Colors.danger, icon: 'xmark.shield.fill', label: 'Unsafe' },
};

const FACTOR_ICONS: Record<string, string> = {
    lighting: 'lightbulb.fill',
    crowd: 'person.2.fill',
    history: 'clock.fill',
};

const FACTOR_LABELS: Record<string, string> = {
    lighting: 'Street Lighting',
    crowd: 'Crowd Density',
    history: 'Safety History',
};

type RouteItem = {
    id: string;
    label: string;
    description: string;
    safetyScore: number;
    safetyFactors: { crowd: number; lighting: number; history: number };
    safetyLevel: 'SAFE' | 'MODERATE' | 'CAUTION' | 'UNSAFE';
    distance: string;
    duration: string;
    mapsLink: string;
    isRecommended: boolean;
    waypoints: { latitude: number; longitude: number }[];
    destination: { label: string };
    origin: { latitude: number; longitude: number };
};

export default function SafeRouteScreen() {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];

    const [destination, setDestination] = useState('');
    const [routes, setRoutes] = useState<RouteItem[]>([]);
    const [selected, setSelected] = useState<RouteItem | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

    // Animations
    const cardAnim = useRef(new Animated.Value(0)).current;
    const shimmerAnim = useRef(new Animated.Value(0)).current;
    const inputRef = useRef<TextInput>(null);

    // ── Load user location once ────────────────────────────────────────────────
    useEffect(() => {
        const cached = getLastKnownLocation();
        if (cached) {
            setUserLocation({ latitude: cached.latitude, longitude: cached.longitude });
        } else {
            getCurrentLocation()
                .then(loc => setUserLocation({ latitude: loc.latitude, longitude: loc.longitude }))
                .catch(() => {
                    // Fallback to a sensible default if GPS unavailable
                    setUserLocation({ latitude: 37.7749, longitude: -122.4194 });
                });
        }
    }, []);

    // ── Shimmer animation while loading ───────────────────────────────────────
    useEffect(() => {
        if (!loading) return;
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmerAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
                Animated.timing(shimmerAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [loading]);

    // ── Search routes ──────────────────────────────────────────────────────────
    const handleSearch = useCallback(async () => {
        if (!destination.trim()) {
            setError('Please enter a destination.');
            return;
        }
        if (!userLocation) {
            setError('Waiting for GPS location…');
            return;
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setLoading(true);
        setError(null);
        setRoutes([]);
        setSelected(null);
        cardAnim.setValue(0);

        try {
            const results = await getRoutes(userLocation, destination) as RouteItem[];
            setRoutes(results);
            // Auto-select the recommended route
            const recommended = results.find((r: RouteItem) => r.isRecommended) ?? results[0];
            setSelected(recommended as RouteItem);

            Animated.spring(cardAnim, {
                toValue: 1, useNativeDriver: true,
                tension: 60, friction: 8,
            }).start();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (err: any) {
            setError(err.message ?? 'Could not find routes. Please try again.');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setLoading(false);
        }
    }, [destination, userLocation]);

    const selectRoute = (route: RouteItem) => {
        Haptics.selectionAsync();
        setSelected(route);
    };

    const openInMaps = (route: RouteItem) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Linking.openURL(route.mapsLink).catch(() => { });
    };

    // ── Score bar ──────────────────────────────────────────────────────────────
    const ScoreBar = ({ value, color }: { value: number; color: string }) => {
        const barAnim = useRef(new Animated.Value(0)).current;
        useEffect(() => {
            Animated.timing(barAnim, {
                toValue: value / 100, duration: 700, useNativeDriver: false,
            }).start();
        }, [value]);

        return (
            <View style={styles.scoreBarTrack}>
                <Animated.View style={[
                    styles.scoreBarFill,
                    { width: barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), backgroundColor: color },
                ]} />
            </View>
        );
    };

    // ── Visual route on map ───────────────────────────────────────────────────
    const MapVisual = ({ route }: { route: RouteItem | null }) => {
        const cfg = route ? LEVEL_CONFIG[route.safetyLevel] : LEVEL_CONFIG.SAFE;
        return (
            <View style={[styles.mapContainer, {
                backgroundColor: colorScheme === 'dark' ? '#1A2035' : '#E8F4FD',
                borderColor: theme.border,
            }]}>
                {/* Grid */}
                {[...Array(6)].map((_, i) => (
                    <View key={`h${i}`} style={[styles.gridH, { top: i * 37, backgroundColor: colorScheme === 'dark' ? '#2D3748' : '#CBD5E0' }]} />
                ))}
                {[...Array(5)].map((_, i) => (
                    <View key={`v${i}`} style={[styles.gridV, { left: i * (width - 40) / 4, backgroundColor: colorScheme === 'dark' ? '#2D3748' : '#CBD5E0' }]} />
                ))}

                {/* Simulated route line */}
                {route && (
                    <View style={styles.routeLine}>
                        {route.waypoints.map((_: { latitude: number; longitude: number }, i: number) => {
                            if (i === route.waypoints.length - 1) return null;
                            const x = (i / (route.waypoints.length - 1)) * (width - 60);
                            const y = MAP_HEIGHT / 2 + Math.sin(i * 0.8 + routes.indexOf(route)) * 30;
                            return (
                                <View
                                    key={i}
                                    style={[styles.routeDot, { left: x, top: y, backgroundColor: cfg.color }]}
                                />
                            );
                        })}
                    </View>
                )}

                {/* Origin pin */}
                <View style={[styles.originPin, { backgroundColor: Colors.primary }]}>
                    <IconSymbol name="location.fill" size={10} color="#fff" />
                </View>

                {/* Destination pin */}
                {route && (
                    <View style={[styles.destPin, { backgroundColor: cfg.color }]}>
                        <IconSymbol name="location.fill" size={10} color="#fff" />
                    </View>
                )}

                {/* Safety badge overlay */}
                {route && (
                    <View style={[styles.mapBadge, { backgroundColor: theme.surface + 'EE' }]}>
                        <IconSymbol name={cfg.icon as any} size={12} color={cfg.color} />
                        <Text style={[styles.mapBadgeText, { color: theme.text }]}>
                            {route.label} · Score {route.safetyScore}/100
                        </Text>
                    </View>
                )}

                {!route && (
                    <View style={styles.mapPlaceholder}>
                        <IconSymbol name="map.fill" size={32} color={theme.textSecondary} />
                        <Text style={[styles.mapPlaceholderText, { color: theme.textSecondary }]}>
                            Enter destination to see routes
                        </Text>
                    </View>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scroll}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* ── Header ── */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <IconSymbol name="chevron.left" size={20} color={theme.text} />
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.title, { color: theme.text }]}>Safe Route</Text>
                            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                                AI-powered safety scores for each path
                            </Text>
                        </View>
                        <View style={[styles.betaBadge, { backgroundColor: Colors.info + '20' }]}>
                            <Text style={[styles.betaText, { color: Colors.info }]}>PROTOTYPE</Text>
                        </View>
                    </View>

                    {/* ── Search bar ── */}
                    <View style={[styles.searchCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <View style={[styles.originRow, { borderBottomColor: theme.border }]}>
                            <View style={[styles.pinDot, { backgroundColor: Colors.primary }]} />
                            <Text style={[styles.originLabel, { color: theme.textSecondary }]}>
                                {userLocation ? 'Your current location' : 'Fetching GPS…'}
                            </Text>
                        </View>
                        <View style={styles.destRow}>
                            <View style={[styles.pinDot, { backgroundColor: Colors.danger }]} />
                            <TextInput
                                ref={inputRef}
                                style={[styles.destInput, { color: theme.text }]}
                                placeholder="Where are you going?"
                                placeholderTextColor={theme.textSecondary}
                                value={destination}
                                onChangeText={setDestination}
                                onSubmitEditing={handleSearch}
                                returnKeyType="search"
                                autoCapitalize="words"
                            />
                            {destination.length > 0 && (
                                <TouchableOpacity onPress={() => setDestination('')}>
                                    <IconSymbol name="xmark.circle.fill" size={18} color={theme.textSecondary} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    <TouchableOpacity
                        style={[styles.searchBtn, { backgroundColor: Colors.primary, opacity: loading ? 0.7 : 1 }]}
                        onPress={handleSearch}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <IconSymbol name="shield.fill" size={18} color="#fff" />
                        )}
                        <Text style={styles.searchBtnText}>
                            {loading ? 'Analysing routes…' : 'Find Safest Route'}
                        </Text>
                    </TouchableOpacity>

                    {/* ── Error ── */}
                    {error && (
                        <View style={[styles.errorBanner, { backgroundColor: Colors.danger + '15', borderColor: Colors.danger + '35' }]}>
                            <IconSymbol name="exclamationmark.circle.fill" size={16} color={Colors.danger} />
                            <Text style={[styles.errorText, { color: Colors.danger }]}>{error}</Text>
                        </View>
                    )}

                    {/* ── Map visual ── */}
                    <MapVisual route={selected} />

                    {/* ── Route cards ── */}
                    {routes.length > 0 && (
                        <Animated.View style={{ opacity: cardAnim, transform: [{ scale: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] }}>
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Route Options</Text>

                            {routes.map((route) => {
                                const cfg = LEVEL_CONFIG[route.safetyLevel];
                                const isSelected = selected?.id === route.id;
                                return (
                                    <TouchableOpacity
                                        key={route.id}
                                        style={[
                                            styles.routeCard,
                                            {
                                                backgroundColor: isSelected ? cfg.color + '12' : theme.surface,
                                                borderColor: isSelected ? cfg.color + '60' : theme.border,
                                                borderWidth: isSelected ? 2 : 1,
                                            },
                                        ]}
                                        onPress={() => selectRoute(route)}
                                        activeOpacity={0.85}
                                    >
                                        {/* Route header */}
                                        <View style={styles.routeHeader}>
                                            <View style={[styles.routeIconWrap, { backgroundColor: cfg.color + '18' }]}>
                                                <IconSymbol name={cfg.icon as any} size={18} color={cfg.color} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <View style={styles.routeNameRow}>
                                                    <Text style={[styles.routeName, { color: theme.text }]}>{route.label}</Text>
                                                    {route.isRecommended && (
                                                        <View style={[styles.recommendBadge, { backgroundColor: Colors.success }]}>
                                                            <Text style={styles.recommendText}>RECOMMENDED</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <Text style={[styles.routeDesc, { color: theme.textSecondary }]}>
                                                    {route.description}
                                                </Text>
                                            </View>

                                            {/* Score circle */}
                                            <View style={[styles.scoreBubble, { backgroundColor: cfg.color }]}>
                                                <Text style={styles.scoreBubbleNum}>{route.safetyScore}</Text>
                                                <Text style={styles.scoreBubbleLabel}>/100</Text>
                                            </View>
                                        </View>

                                        {/* Distance / Duration */}
                                        <View style={styles.metaRow}>
                                            {[
                                                { icon: 'figure.walk', value: route.distance },
                                                { icon: 'clock.fill', value: route.duration },
                                                { icon: 'shield.fill', value: cfg.label },
                                            ].map(m => (
                                                <View key={m.icon} style={[styles.metaChip, { backgroundColor: theme.background }]}>
                                                    <IconSymbol name={m.icon as any} size={11} color={theme.textSecondary} />
                                                    <Text style={[styles.metaChipText, { color: theme.textSecondary }]}>{m.value}</Text>
                                                </View>
                                            ))}
                                        </View>

                                        {/* Safety factor bars — only when selected */}
                                        {isSelected && (
                                            <View style={[styles.factorsWrap, { borderTopColor: theme.border }]}>
                                                {(['lighting', 'crowd', 'history'] as const).map(factor => {
                                                    const val = route.safetyFactors[factor as keyof typeof route.safetyFactors];
                                                    const factorColor = val >= 70 ? Colors.success : val >= 45 ? Colors.warning : Colors.danger;
                                                    return (
                                                        <View key={factor} style={styles.factorRow}>
                                                            <IconSymbol name={FACTOR_ICONS[factor] as any} size={13} color={factorColor} />
                                                            <Text style={[styles.factorLabel, { color: theme.textSecondary }]}>
                                                                {FACTOR_LABELS[factor]}
                                                            </Text>
                                                            <View style={{ flex: 1 }}>
                                                                <ScoreBar value={val} color={factorColor} />
                                                            </View>
                                                            <Text style={[styles.factorVal, { color: factorColor }]}>{val}</Text>
                                                        </View>
                                                    );
                                                })}

                                                {/* Summary */}
                                                <View style={[styles.summaryBox, { backgroundColor: cfg.color + '10', borderColor: cfg.color + '30' }]}>
                                                    <IconSymbol name="info.circle.fill" size={14} color={cfg.color} />
                                                    <Text style={[styles.summaryText, { color: theme.text }]}>
                                                        {getRouteSummary(route as any)}
                                                    </Text>
                                                </View>

                                                {/* Open in maps */}
                                                <TouchableOpacity
                                                    style={[styles.mapsBtn, { backgroundColor: Colors.info + '15', borderColor: Colors.info + '30' }]}
                                                    onPress={() => openInMaps(route)}
                                                >
                                                    <IconSymbol name="map.fill" size={14} color={Colors.info} />
                                                    <Text style={[styles.mapsBtnText, { color: Colors.info }]}>Open in Google Maps</Text>
                                                    <IconSymbol name="chevron.right" size={12} color={Colors.info} />
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}

                            {/* Prototype disclaimer */}
                            <View style={[styles.disclaimer, { backgroundColor: Colors.warning + '10', borderColor: Colors.warning + '30' }]}>
                                <IconSymbol name="exclamationmark.triangle.fill" size={14} color={Colors.warning} />
                                <Text style={[styles.disclaimerText, { color: theme.textSecondary }]}>
                                    Safety scores are simulated for demonstration. Always use your own judgement when choosing a route.
                                </Text>
                            </View>
                        </Animated.View>
                    )}

                    {/* ── Empty state ── */}
                    {!loading && routes.length === 0 && !error && (
                        <View style={styles.emptyState}>
                            {[
                                { icon: 'shield.fill', color: Colors.success, label: 'Crowd-Aware Routing' },
                                { icon: 'lightbulb.fill', color: Colors.warning, label: 'Lighting Analysis' },
                                { icon: 'clock.fill', color: Colors.info, label: 'Historical Safety' },
                            ].map(f => (
                                <View key={f.label} style={[styles.featureChip, { backgroundColor: f.color + '12', borderColor: f.color + '30' }]}>
                                    <IconSymbol name={f.icon as any} size={16} color={f.color} />
                                    <Text style={[styles.featureChipText, { color: theme.text }]}>{f.label}</Text>
                                </View>
                            ))}
                            <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>
                                Type a destination above to see safety-scored route options
                            </Text>
                        </View>
                    )}

                    <View style={{ height: 40 }} />
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scroll: { paddingHorizontal: 20, paddingBottom: 40 },

    header: {
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16,
    },
    backBtn: {
        width: 36, height: 36, borderRadius: 18,
        alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
    subtitle: { fontSize: 12, marginTop: 1 },
    betaBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    betaText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },

    // Search
    searchCard: {
        borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 12,
    },
    originRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1,
    },
    destRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 14, paddingVertical: 4,
    },
    pinDot: { width: 10, height: 10, borderRadius: 5 },
    originLabel: { fontSize: 13 },
    destInput: { flex: 1, fontSize: 15, fontWeight: '600', paddingVertical: 10 },

    searchBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        paddingVertical: 15, borderRadius: 16, marginBottom: 16,
        shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5,
    },
    searchBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

    errorBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 14,
    },
    errorText: { fontSize: 13, fontWeight: '600', flex: 1 },

    // Map
    mapContainer: {
        height: MAP_HEIGHT, borderRadius: 20, overflow: 'hidden',
        borderWidth: 1, marginBottom: 20, position: 'relative',
    },
    gridH: { position: 'absolute', left: 0, right: 0, height: 1, opacity: 0.35 },
    gridV: { position: 'absolute', top: 0, bottom: 0, width: 1, opacity: 0.35 },
    routeLine: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    routeDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
    originPin: {
        position: 'absolute', left: 14, top: MAP_HEIGHT / 2 - 14,
        width: 26, height: 26, borderRadius: 13,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 4,
    },
    destPin: {
        position: 'absolute', right: 14, top: MAP_HEIGHT / 2 - 14,
        width: 26, height: 26, borderRadius: 13,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 4,
    },
    mapBadge: {
        position: 'absolute', bottom: 10, left: 10, right: 10,
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    },
    mapBadgeText: { fontSize: 12, fontWeight: '700', flex: 1 },
    mapPlaceholder: {
        flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    mapPlaceholderText: { fontSize: 13, fontWeight: '500' },

    // Route cards
    sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14, letterSpacing: -0.2 },
    routeCard: {
        borderRadius: 18, padding: 16, marginBottom: 12, overflow: 'hidden',
    },
    routeHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
    routeIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    routeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 },
    routeName: { fontSize: 16, fontWeight: '800' },
    routeDesc: { fontSize: 12, lineHeight: 18 },
    recommendBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
    recommendText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
    scoreBubble: {
        width: 52, height: 52, borderRadius: 26,
        alignItems: 'center', justifyContent: 'center',
        shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
    },
    scoreBubbleNum: { color: '#fff', fontSize: 18, fontWeight: '900', lineHeight: 20 },
    scoreBubbleLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 9, fontWeight: '700' },

    metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
    metaChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    },
    metaChipText: { fontSize: 11, fontWeight: '600' },

    // Factor breakdown
    factorsWrap: { borderTopWidth: 1, marginTop: 12, paddingTop: 12, gap: 10 },
    factorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    factorLabel: { fontSize: 11, fontWeight: '600', width: 100 },
    factorVal: { fontSize: 12, fontWeight: '800', width: 28, textAlign: 'right' },
    scoreBarTrack: {
        flex: 1, height: 6, borderRadius: 3,
        backgroundColor: 'rgba(0,0,0,0.08)', overflow: 'hidden',
    },
    scoreBarFill: { height: '100%', borderRadius: 3 },

    summaryBox: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
        borderRadius: 12, borderWidth: 1, padding: 10, marginTop: 4,
    },
    summaryText: { fontSize: 12, lineHeight: 18, flex: 1, fontWeight: '500' },

    mapsBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 10,
    },
    mapsBtnText: { flex: 1, fontSize: 13, fontWeight: '700' },

    disclaimer: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
        borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 4, marginBottom: 4,
    },
    disclaimerText: { fontSize: 11, lineHeight: 18, flex: 1 },

    // Empty state
    emptyState: { alignItems: 'center', paddingTop: 8, gap: 10 },
    featureChip: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 14, paddingVertical: 10, borderRadius: 30, borderWidth: 1,
        width: '100%',
    },
    featureChipText: { fontSize: 14, fontWeight: '600' },
    emptyHint: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 8, paddingHorizontal: 16 },
});
