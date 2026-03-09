import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    BackHandler,
    TouchableOpacity,
    StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { resolveEmergency } from '@/services/emergencyService';
import { startPeriodicCapture, stopPeriodicCapture, startAudioRecording, stopRecording } from '@/services/evidenceService';

export default function FakeShutdownScreen() {
    const [countdown, setCountdown] = useState(15);
    const [mode, setMode] = useState<'countdown' | 'active'>('countdown');
    const cameraRef = useRef<CameraView>(null);
    const [permission, requestPermission] = useCameraPermissions();

    useEffect(() => {
        if (!permission?.granted) requestPermission();
    }, [permission]);

    // Prevent physical back button
    useEffect(() => {
        const onBackPress = () => true;
        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
    }, []);

    // Countdown logic
    useEffect(() => {
        if (mode !== 'countdown') return;

        console.info(`[covertMode] SOS countdown started: ${countdown}s`);

        if (countdown <= 0) {
            console.info('[covertMode] Emergency mode triggered');
            setMode('active');
            handleActivateCovertMode();
            return;
        }

        const timer = setTimeout(() => {
            setCountdown(c => c - 1);
        }, 1000);

        return () => clearTimeout(timer);
    }, [countdown, mode]);

    const handleActivateCovertMode = async () => {
        console.info('[covertMode] Emergency mode activated');

        // 1. Audio recording starts secretly
        try {
            const audioRes = await startAudioRecording();
            console.info(`[evidence] Audio recording started (URI: ${audioRes.uri})`);
        } catch (err) {
            console.warn('[evidence] Could not start audio:', err);
        }

        // 2. Start hidden background photo capture
        startPeriodicCapture(cameraRef, (result) => {
            if (result) {
                console.info(`[evidence] Photo captured: ${result.uri}`);
            }
        });

        console.info('[tracking] Location tracking continues');
    };

    const handleCancelCovertMode = async () => {
        console.info('[covertMode] SOS cancelled by user');
        if (mode === 'active') {
            stopPeriodicCapture();
            await stopRecording();
        }
        await resolveEmergency();
        router.back();
    };

    return (
        <View style={styles.container}>
            <StatusBar hidden />

            {/* Hidden camera instance (1x1 pixel so it's invisible to the user) */}
            {permission?.granted && (
                <View style={styles.hiddenCameraContainer}>
                    <CameraView
                        ref={cameraRef}
                        style={styles.hiddenCamera}
                        facing="front"
                        mute={true}
                    />
                </View>
            )}

            <ActivityIndicator size="small" color="#555" style={styles.spinner} />
            <Text style={styles.text}>Shutting Down...</Text>

            {/* Hidden cancel button block to stop emergency */}
            <TouchableOpacity
                style={styles.hiddenCancelBtn}
                activeOpacity={1}
                onLongPress={handleCancelCovertMode}
                delayLongPress={2000}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000', // Pitch black
        alignItems: 'center',
        justifyContent: 'center',
    },
    spinner: {
        marginBottom: 20,
    },
    text: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 16,
        fontWeight: '500',
    },
    hiddenCameraContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 1,
        height: 1,
        opacity: 0,
        overflow: 'hidden',
    },
    hiddenCamera: {
        width: 1,
        height: 1,
    },
    // Invisible overlay covering the top left corner.
    // Long press for 2 seconds cancels the SOS/Shutdown.
    hiddenCancelBtn: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 100,
        height: 100,
        backgroundColor: 'transparent',
    }
});
