import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    BackHandler,
    StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { State, TapGestureHandler, TapGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { resolveEmergency } from '@/services/emergencyService';
import { startPeriodicCapture, stopPeriodicCapture, startAudioRecording, stopRecording } from '@/services/evidenceService';

export default function FakeShutdownScreen() {
    const [mode, setMode] = useState<'animating' | 'blackout'>('animating');
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

    // Blackout transition timer
    useEffect(() => {
        if (mode !== 'animating') return;

        console.info('[covertMode] Fake shutdown animation started');

        const timer = setTimeout(() => {
            console.info('[covertMode] Screen entered blackout mode');
            setMode('blackout');
            handleActivateCovertMode();
        }, 5000);

        return () => clearTimeout(timer);
    }, [mode]);

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

    const handleWakeGesture = async (event: TapGestureHandlerStateChangeEvent) => {
        if (event.nativeEvent.state === State.ACTIVE) {
            console.info('[covertMode] Hidden wake gesture detected');
            console.info('[covertMode] Exiting fake shutdown');

            // Optionally clean up background capturing logic
            stopPeriodicCapture();
            await stopRecording();
            await resolveEmergency();

            console.info('[covertMode] Device awakened from fake shutdown.');
            router.replace('/(tabs)');
        }
    };

    return (
        <TapGestureHandler
            onHandlerStateChange={handleWakeGesture}
            numberOfTaps={5}
            maxDelayMs={300}
        >
            <View style={styles.container}>
                <StatusBar hidden={true} />

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

                {mode === 'animating' && (
                    <View style={styles.animationLayer}>
                        <ActivityIndicator size="small" color="#555" style={styles.spinner} />
                        <Text style={styles.text}>Shutting down...</Text>
                    </View>
                )}
            </View>
        </TapGestureHandler>
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
    animationLayer: {
        alignItems: 'center',
        justifyContent: 'center',
    }
});
