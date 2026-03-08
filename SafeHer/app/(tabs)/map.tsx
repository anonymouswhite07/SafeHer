import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Animated,
    Dimensions,
    Alert,
    Linking,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSafeHer } from '@/context/SafeHerContext';
import * as Haptics from 'expo-haptics';
import {
    getCurrentLocation,
    startLocationTracking,
    stopLocationTracking,
    getLastKnownLocation,
    reverseGeocode,
    buildMapsLink,
    hasLocationPermission,
    requestLocationPermission,
} from '@/services/locationService';

const { width } = Dimensions.get('window');

interface LocationSnapshot {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    altitude: number | null;
    speed: number | null;
    heading: number | null;
    timestamp: number;
    mapsLink: string;
    address: string;
}

export default function MapScreen() {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];
    const { safeZones, addSafeZone, removeSafeZone } = useSafeHer();

    const [location, setLocation] = useState<LocationSnapshot | null>(null);
    const [permissionGranted, setPermissionGranted] = useState(false);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [tracking, setTracking] = useState(false);
    const [fetchingOnce, setFetchingOnce] = useState(false);

    // Animations
    const pingAnim = useRef(new Animated.Value(1)).current;
    const ringAnim = useRef(new Animated.Value(1)).current;
    const trackingDot = useRef(new Animated.Value(1)).current;

    // ── Animations ────────────────────────────────────────────────────────────────
    useEffect(() => {
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pingAnim, { toValue: 1.1, duration: 800, useNativeDriver: true }),
                Animated.timing(pingAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            ])
        );
        const ring = Animated.loop(
            Animated.sequence([
                Animated.timing(ringAnim, { toValue: 2.8, duration: 2000, useNativeDriver: true }),
                Animated.timing(ringAnim, { toValue: 1, duration: 0, useNativeDriver: true }),
            ])
        );
        const dot = Animated.loop(
            Animated.sequence([
                Animated.timing(trackingDot, { toValue: 0.3, duration: 600, useNativeDriver: true }),
                Animated.timing(trackingDot, { toValue: 1, duration: 600, useNativeDriver: true }),
            ])
        );
        pulse.start(); ring.start(); dot.start();
        return () => { pulse.stop(); ring.stop(); dot.stop(); };
    }, []);

    // ── Check permission on mount, then load last known or fetch once ─────────────
    useEffect(() => {
        (async () => {
            const granted = await hasLocationPermission();
            setPermissionGranted(granted);
            if (granted) {
                // Use last known location instantly if available
                const cached = getLastKnownLocation();
                if (cached) {
                    const address = await reverseGeocode(cached.latitude, cached.longitude);
                    setLocation({ ...cached, address });
                } else {
                    fetchOnce();
                }
            }
        })();
    }, []);

    // ── One-shot fetch ─────────────────────────────────────────────────────────────
    const fetchOnce = useCallback(async () => {
        setFetchingOnce(true);
        setLocationError(null);
        try {
            const loc = await getCurrentLocation();
            const address = await reverseGeocode(loc.latitude, loc.longitude);
            setLocation({ ...loc, address });
            setPermissionGranted(true);
        } catch (err: any) {
            setLocationError(err.message ?? 'Location unavailable');
            setPermissionGranted(false);
        } finally {
            setFetchingOnce(false);
        }
    }, []);

    // ── Continuous tracking ────────────────────────────────────────────────────────
    const handleUpdateRef = useRef<((loc: any) => void) | null>(null);

    const startTracking = useCallback(async () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTracking(true);

        const onUpdate = async (loc: any) => {
            const address = await reverseGeocode(loc.latitude, loc.longitude);
            setLocation({ ...loc, address });
        };
        const onError = (err: Error) => {
            setLocationError(err.message);
            setTracking(false);
        };

        handleUpdateRef.current = onUpdate;
        await startLocationTracking(onUpdate, onError, { distanceInterval: 5, timeInterval: 4000 });
    }, []);

    const stopTracking = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (handleUpdateRef.current) {
            stopLocationTracking(handleUpdateRef.current);
            handleUpdateRef.current = null;
        }
        setTracking(false);
    }, []);

    // Stop tracking when screen unmounts
    useEffect(() => {
        return () => {
            if (handleUpdateRef.current) {
                stopLocationTracking(handleUpdateRef.current);
            }
        };
    }, []);

    // ── Request permission ────────────────────────────────────────────────────────
    const requestPermission = async () => {
        const granted = await requestLocationPermission();
        setPermissionGranted(granted);
        if (granted) fetchOnce();
        else Alert.alert('Permission Denied', 'Location access is required. Please enable it in your device settings.');
    };

    // ── Add safe zone ─────────────────────────────────────────────────────────────
    const handleAddSafeZone = async () => {
        if (!location) {
            Alert.alert('No Location', 'Please enable location tracking first.');
            return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await addSafeZone({
            name: location.address || `Safe Zone (${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)})`,
            latitude: location.latitude,
            longitude: location.longitude,
            radius: 200,
        });
        Alert.alert('Safe Zone Added ✓', `"${location.address || 'This location'}" has been marked as a safe zone.`);
    };

    // ── Open native maps ─────────────────────────────────────────────────────────
    const openInMaps = () => {
        if (!location) return;
        Haptics.selectionAsync();
        Linking.openURL(location.mapsLink).catch(() =>
            Alert.alert('Error', 'Could not open Maps.')
        );
    };

    const formatCoord = (val: number) => val.toFixed(5);
    const formatSpeed = (val: number | null) =>
        val !== null && val > 0 ? `${(val * 3.6).toFixed(1)} km/h` : 'Still';
    const formatTime = (ts: number) =>
        new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

                {/* ── Header ── */}
                <View style={styles.header}>
                    <View>
                        <Text style={[styles.title, { color: theme.text }]}>Live Location</Text>
                        {tracking && (
                            <View style={styles.trackingBadge}>
                                <Animated.View style={[styles.trackingDot, { opacity: trackingDot }]} />
                                <Text style={styles.trackingLabel}>LIVE TRACKING</Text>
                            </View>
                        )}
                    </View>
                    <TouchableOpacity
                        style={[styles.refreshBtn, { backgroundColor: Colors.info + '18' }]}
                        onPress={() => { fetchOnce(); Haptics.selectionAsync(); }}
                        disabled={fetchingOnce}
                    >
                        <IconSymbol name="arrow.clockwise" size={18} color={Colors.info} />
                    </TouchableOpacity>
                </View>

                {/* ── Permission banner ── */}
                {!permissionGranted && (
                    <TouchableOpacity
                        style={[styles.permBanner, { backgroundColor: Colors.warning + '15', borderColor: Colors.warning + '40' }]}
                        onPress={requestPermission}
                    >
                        <IconSymbol name="location.slash.fill" size={22} color={Colors.warning} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.permTitle, { color: Colors.warning }]}>Location Access Required</Text>
                            <Text style={[styles.permMsg, { color: theme.textSecondary }]}>
                                Tap to grant permission and enable live location features.
                            </Text>
                        </View>
                        <View style={[styles.grantBtn, { backgroundColor: Colors.warning }]}>
                            <Text style={styles.grantBtnText}>Enable</Text>
                        </View>
                    </TouchableOpacity>
                )}

                {/* ── Map view ── */}
                <View style={[styles.mapContainer, {
                    backgroundColor: colorScheme === 'dark' ? '#1A2035' : '#E8F4FD',
                    borderColor: theme.border,
                }]}>
                    {/* Grid lines */}
                    {[...Array(8)].map((_, i) => (
                        <View key={`h-${i}`} style={[styles.gridLineH, { top: i * 42, backgroundColor: colorScheme === 'dark' ? '#2D3748' : '#CBD5E0' }]} />
                    ))}
                    {[...Array(6)].map((_, i) => (
                        <View key={`v-${i}`} style={[styles.gridLineV, { left: i * 64, backgroundColor: colorScheme === 'dark' ? '#2D3748' : '#CBD5E0' }]} />
                    ))}

                    {/* Animated ping */}
                    <View style={styles.pingCenter}>
                        <Animated.View style={[
                            styles.pingRing,
                            {
                                transform: [{ scale: ringAnim }],
                                opacity: ringAnim.interpolate({ inputRange: [1, 2.8], outputRange: [tracking ? 0.35 : 0.2, 0] }),
                            },
                        ]} />
                        <Animated.View style={[styles.pingDot, { transform: [{ scale: pingAnim }] }]}>
                            <View style={[styles.pingInner, { backgroundColor: tracking ? Colors.success : Colors.primary }]} />
                        </Animated.View>
                    </View>

                    {/* Safe zone rings */}
                    {safeZones.slice(0, 2).map((zone, idx) => (
                        <View
                            key={zone.id}
                            style={[
                                styles.safeZoneMarker,
                                { left: 60 + idx * 90, top: 40 + idx * 55, borderColor: Colors.success, backgroundColor: Colors.success + '25' },
                            ]}
                        >
                            <IconSymbol name="shield.fill" size={10} color={Colors.success} />
                        </View>
                    ))}

                    {/* Map overlay badge */}
                    <TouchableOpacity
                        style={[styles.mapBadge, { backgroundColor: theme.surface + 'EE' }]}
                        onPress={openInMaps}
                        disabled={!location}
                    >
                        <IconSymbol name="location.fill" size={12} color={location ? Colors.primary : theme.textSecondary} />
                        <Text style={[styles.mapBadgeText, { color: theme.text }]} numberOfLines={1}>
                            {fetchingOnce
                                ? 'Locating…'
                                : location
                                    ? location.address || `${formatCoord(location.latitude)}, ${formatCoord(location.longitude)}`
                                    : 'Location not available'}
                        </Text>
                        {location && (
                            <IconSymbol name="arrow.clockwise" size={10} color={Colors.primary} />
                        )}
                    </TouchableOpacity>
                </View>

                {/* ── Coordinates card ── */}
                {location && (
                    <>
                        <View style={styles.statsGrid}>
                            {[
                                { label: 'Latitude', value: formatCoord(location.latitude), icon: 'scope', color: Colors.primary },
                                { label: 'Longitude', value: formatCoord(location.longitude), icon: 'scope', color: Colors.secondary },
                                { label: 'Speed', value: formatSpeed(location.speed), icon: 'gauge', color: Colors.info },
                                { label: 'Accuracy', value: location.accuracy ? `±${Math.round(location.accuracy)}m` : 'N/A', icon: 'target', color: Colors.success },
                            ].map(stat => (
                                <View key={stat.label} style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                    <View style={[styles.statIcon, { backgroundColor: stat.color + '15' }]}>
                                        <IconSymbol name={stat.icon as any} size={14} color={stat.color} />
                                    </View>
                                    <Text style={[styles.statValue, { color: theme.text }]}>{stat.value}</Text>
                                    <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{stat.label}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Google Maps link row */}
                        <TouchableOpacity
                            style={[styles.mapsLinkRow, { backgroundColor: Colors.info + '10', borderColor: Colors.info + '30' }]}
                            onPress={openInMaps}
                        >
                            <View style={[styles.mapsIcon, { backgroundColor: Colors.info + '20' }]}>
                                <IconSymbol name="map.fill" size={18} color={Colors.info} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.mapsLinkLabel, { color: theme.text }]}>Open in Google Maps</Text>
                                <Text style={[styles.mapsLinkUrl, { color: theme.textSecondary }]} numberOfLines={1}>
                                    {location.mapsLink}
                                </Text>
                            </View>
                            <IconSymbol name="chevron.right" size={16} color={Colors.info} />
                        </TouchableOpacity>

                        {/* Last updated */}
                        <Text style={[styles.lastUpdated, { color: theme.textSecondary }]}>
                            Last updated: {formatTime(location.timestamp)}
                        </Text>
                    </>
                )}

                {/* ── Tracking controls ── */}
                <View style={styles.trackingControls}>
                    {!tracking ? (
                        <TouchableOpacity
                            style={[styles.trackBtn, { backgroundColor: Colors.success }]}
                            onPress={startTracking}
                            disabled={!permissionGranted}
                        >
                            <IconSymbol name="location.fill" size={18} color="#fff" />
                            <Text style={styles.trackBtnText}>Start Live Tracking</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={[styles.trackBtn, { backgroundColor: Colors.danger }]}
                            onPress={stopTracking}
                        >
                            <IconSymbol name="location.slash.fill" size={18} color="#fff" />
                            <Text style={styles.trackBtnText}>Stop Tracking</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* ── Action cards ── */}
                <TouchableOpacity
                    style={[styles.actionCard, { backgroundColor: Colors.success + '12', borderColor: Colors.success + '35' }]}
                    onPress={handleAddSafeZone}
                    disabled={!location}
                >
                    <View style={[styles.actionIcon, { backgroundColor: Colors.success + '20' }]}>
                        <IconSymbol name="shield.fill" size={22} color={Colors.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.actionTitle, { color: theme.text }]}>Mark as Safe Zone</Text>
                        <Text style={[styles.actionDesc, { color: theme.textSecondary }]}>
                            Save current position as a trusted safe area
                        </Text>
                    </View>
                    <IconSymbol name="chevron.right" size={16} color={theme.textSecondary} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.actionCard, { backgroundColor: Colors.primary + '12', borderColor: Colors.primary + '35' }]}
                    onPress={openInMaps}
                    disabled={!location}
                >
                    <View style={[styles.actionIcon, { backgroundColor: Colors.primary + '20' }]}>
                        <IconSymbol name="paperplane.fill" size={22} color={Colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.actionTitle, { color: theme.text }]}>Share My Location</Text>
                        <Text style={[styles.actionDesc, { color: theme.textSecondary }]}>
                            {location ? location.mapsLink : 'Enable location to share your position'}
                        </Text>
                    </View>
                    <IconSymbol name="chevron.right" size={16} color={theme.textSecondary} />
                </TouchableOpacity>

                {/* ── Safe Zones list ── */}
                {safeZones.length > 0 && (
                    <>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>My Safe Zones</Text>
                        {safeZones.map(zone => (
                            <View key={zone.id} style={[styles.zoneRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                <View style={[styles.zoneIcon, { backgroundColor: Colors.success + '18' }]}>
                                    <IconSymbol name="shield.fill" size={18} color={Colors.success} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.zoneName, { color: theme.text }]}>{zone.name}</Text>
                                    <Text style={[styles.zoneCoords, { color: theme.textSecondary }]}>
                                        {formatCoord(zone.latitude)}, {formatCoord(zone.longitude)} · {zone.radius}m radius
                                    </Text>
                                    <TouchableOpacity onPress={() => Linking.openURL(buildMapsLink(zone.latitude, zone.longitude))}>
                                        <Text style={[styles.zonemapsLink, { color: Colors.info }]}>View in Maps ↗</Text>
                                    </TouchableOpacity>
                                </View>
                                <TouchableOpacity onPress={() => removeSafeZone(zone.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <IconSymbol name="xmark.circle.fill" size={22} color={theme.textSecondary} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </>
                )}

                <View style={{ height: 32 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scroll: { paddingHorizontal: 20, paddingBottom: 40 },

    header: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'flex-start', paddingVertical: 16,
    },
    title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, marginBottom: 4 },
    trackingBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    trackingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
    trackingLabel: { fontSize: 11, fontWeight: '800', color: Colors.success, letterSpacing: 1 },
    refreshBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

    permBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 16,
    },
    permTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
    permMsg: { fontSize: 12, lineHeight: 18 },
    grantBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
    grantBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },

    // Map
    mapContainer: {
        height: 270, borderRadius: 20, overflow: 'hidden',
        position: 'relative', marginBottom: 16, borderWidth: 1,
    },
    gridLineH: { position: 'absolute', left: 0, right: 0, height: 1, opacity: 0.4 },
    gridLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, opacity: 0.4 },
    pingCenter: {
        position: 'absolute', top: '50%', left: '50%',
        transform: [{ translateX: -20 }, { translateY: -20 }],
    },
    pingRing: {
        position: 'absolute', width: 80, height: 80, borderRadius: 40,
        backgroundColor: Colors.primary, top: -20, left: -20,
    },
    pingDot: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: Colors.primary + '30',
        alignItems: 'center', justifyContent: 'center',
    },
    pingInner: { width: 16, height: 16, borderRadius: 8 },
    safeZoneMarker: {
        position: 'absolute', width: 32, height: 32, borderRadius: 16,
        borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
    },
    mapBadge: {
        position: 'absolute', bottom: 12, left: 12, right: 12,
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    },
    mapBadgeText: { fontSize: 13, fontWeight: '600', flex: 1 },

    // Stats
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
    statCard: {
        width: (width - 62) / 2, padding: 12,
        borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 4,
    },
    statIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    statValue: { fontSize: 15, fontWeight: '800' },
    statLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },

    lastUpdated: { fontSize: 11, textAlign: 'center', marginBottom: 16, fontWeight: '500' },

    mapsLinkRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 12,
    },
    mapsIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    mapsLinkLabel: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
    mapsLinkUrl: { fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

    // Tracking controls
    trackingControls: { marginBottom: 16 },
    trackBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        paddingVertical: 15, borderRadius: 16,
        shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
    },
    trackBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

    // Action cards
    actionCard: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12,
    },
    actionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    actionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
    actionDesc: { fontSize: 12 },

    sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: 4, marginBottom: 12 },
    zoneRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10,
    },
    zoneIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    zoneName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
    zoneCoords: { fontSize: 11, marginBottom: 2 },
    zonemapsLink: { fontSize: 11, fontWeight: '700' },
});
