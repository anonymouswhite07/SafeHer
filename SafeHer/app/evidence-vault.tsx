import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Image,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { listEvidenceSessions, deleteEvidenceSession } from '@/services/evidenceService';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

export default function EvidenceVaultScreen() {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];

    const [sessions, setSessions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Audio Player State
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [playingUri, setPlayingUri] = useState<string | null>(null);

    useEffect(() => {
        loadSessions();
        return () => {
            if (sound) {
                sound.unloadAsync();
            }
        };
    }, []);

    const loadSessions = async () => {
        setLoading(true);
        const data = await listEvidenceSessions();
        // data looks like: [{ sessionId, sessionDir, photos: [], audio: [] }, ...]

        // Sort sessions by timestamp descending (newest first)
        const sorted = (data as any[]).sort((a: any, b: any) => {
            const timeA = parseInt(a.sessionId.replace('session_', '')) || 0;
            const timeB = parseInt(b.sessionId.replace('session_', '')) || 0;
            return timeB - timeA;
        });

        setSessions(sorted);
        setLoading(false);
    };

    const handleDelete = (sessionId: string) => {
        Alert.alert(
            'Delete Evidence',
            'Are you sure you want to permanently delete this evidence session?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        await deleteEvidenceSession(sessionId);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        loadSessions(); // Reload
                    }
                }
            ]
        );
    };

    const playAudio = async (uri: string) => {
        try {
            if (sound) {
                await sound.unloadAsync();
                if (playingUri === uri) {
                    setSound(null);
                    setPlayingUri(null);
                    return; // Toggle off
                }
            }

            const { sound: newSound } = await Audio.Sound.createAsync({ uri });
            setSound(newSound);
            setPlayingUri(uri);

            newSound.setOnPlaybackStatusUpdate((status: any) => {
                if (status.didJustFinish) {
                    setPlayingUri(null);
                    newSound.unloadAsync();
                }
            });

            await newSound.playAsync();
        } catch (error) {
            console.error('Error playing audio', error);
            Alert.alert('Error', 'Could not play audio evidence.');
        }
    };

    const renderPhoto = ({ item }: { item: string }) => (
        <Image
            source={{ uri: item }}
            style={styles.photoThumb}
        />
    );

    const formatTime = (sessionId: string) => {
        const ts = parseInt(sessionId.replace('session_', ''));
        if (isNaN(ts)) return 'Unknown Date';
        return new Date(ts).toLocaleString();
    };

    const renderSession = ({ item }: { item: any }) => {
        return (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.cardHeader}>
                    <IconSymbol name="shield.lefthalf.filled" size={20} color={Colors.primary} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.sessionTitle, { color: theme.text }]}>Emergency Event</Text>
                        <Text style={[styles.sessionDate, { color: theme.textSecondary }]}>
                            {formatTime(item.sessionId)}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDelete(item.sessionId)} style={styles.deleteBtn}>
                        <IconSymbol name="trash.fill" size={18} color={theme.textSecondary} />
                    </TouchableOpacity>
                </View>

                {/* Photos */}
                {item.photos && item.photos.length > 0 && (
                    <View style={styles.mediaSection}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Photos ({item.photos.length})</Text>
                        <FlatList
                            data={item.photos}
                            keyExtractor={i => i}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            renderItem={renderPhoto}
                            contentContainerStyle={styles.photoList}
                        />
                    </View>
                )}

                {/* Audio recordings */}
                {item.audio && item.audio.length > 0 && (
                    <View style={styles.mediaSection}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Audio Recordings</Text>
                        {item.audio.map((uri: string, index: number) => {
                            const isPlaying = playingUri === uri;
                            return (
                                <TouchableOpacity
                                    key={index}
                                    style={[styles.audioBtn, { backgroundColor: isPlaying ? Colors.primary + '20' : theme.background, borderColor: isPlaying ? Colors.primary : theme.border }]}
                                    onPress={() => playAudio(uri)}
                                >
                                    <IconSymbol name={isPlaying ? "pause.fill" : "play.fill"} size={16} color={isPlaying ? Colors.primary : theme.text} />
                                    <View style={{ flex: 1, marginLeft: 10 }}>
                                        <Text style={{ color: isPlaying ? Colors.primary : theme.text, fontWeight: '600' }}>
                                            {isPlaying ? 'Playing...' : `Audio Source ${index + 1}`}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}

                {(!item.photos || item.photos.length === 0) && (!item.audio || item.audio.length === 0) && (
                    <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No media captured during this session.</Text>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <IconSymbol name="chevron.left" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Evidence Vault</Text>
                <View style={{ width: 40 }} />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={{ color: theme.textSecondary, marginTop: 10 }}>Loading evidence...</Text>
                </View>
            ) : sessions.length === 0 ? (
                <View style={styles.center}>
                    <IconSymbol name="folder.badge.questionmark" size={48} color={theme.textSecondary} />
                    <Text style={{ color: theme.text, fontSize: 18, fontWeight: '600', marginTop: 16 }}>No Evidence Found</Text>
                    <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 8, paddingHorizontal: 32 }}>
                        Evidence captured during emergencies and covert shutdowns will appear here.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={sessions}
                    keyExtractor={item => item.sessionId}
                    renderItem={renderSession}
                    contentContainerStyle={styles.list}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backButton: {
        padding: 8,
        marginLeft: -8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    list: {
        padding: 16,
    },
    card: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        marginBottom: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    sessionTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    sessionDate: {
        fontSize: 13,
        marginTop: 2,
    },
    deleteBtn: {
        padding: 8,
    },
    mediaSection: {
        marginTop: 12,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    photoList: {
        paddingVertical: 4,
    },
    photoThumb: {
        width: 100,
        height: 100,
        borderRadius: 8,
        marginRight: 10,
        backgroundColor: '#333',
    },
    audioBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 14,
        fontStyle: 'italic',
        marginTop: 10,
    }
});
