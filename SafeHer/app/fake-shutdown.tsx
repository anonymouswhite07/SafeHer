import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    BackHandler,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { resolveEmergency } from '@/services/emergencyService';
import { startPeriodicCapture, stopPeriodicCapture, startAudioRecording, stopRecording } from '@/services/evidenceService';

export default function FakeShutdownScreen() {
    const [mode, setMode] = useState<'animating' | 'blackout'>('animating');
    const [tapsDetected, setTapsDetected] = useState(0);
    const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

    // ── GESTURE LOGIC: 2 Taps followed by Swipe Up > 120px ──

    // 1. Detect taps
    const tapGesture = Gesture.Tap()
        .numberOfTaps(1)
        .onEnd(() => {
            // Keep track of total taps. Needs wrapping inside an isolated scope or state ref
            // Note: Since this executes on UI thread by default, we use JS-side runOnJS.
        })
        .runOnJS(true);

    const handleTapDetected = () => {
        setTapsDetected(prev => {
            const count = prev + 1;
            console.info(`[covertMode] Tap detected (${count})`);

            if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
            // Reset gesture progress if no action happens within 3 seconds
            resetTimerRef.current = setTimeout(() => {
                setTapsDetected(0);
                console.info('[covertMode] Gesture timeout. Swipe locked.');
            }, 3000);

            return count;
        });
    };

    // Override the raw Tap onEnd to correctly funnel back to the JS thread 
    // without clashing with Reanimated.
    const tapSequence = Gesture.Tap()
        .runOnJS(true)
        .onEnd(() => {
            handleTapDetected();
        });

    const handleWake = async () => {
        console.info('[covertMode] Exiting fake shutdown');
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

        stopPeriodicCapture();
        await stopRecording();
        await resolveEmergency();

        console.info('[covertMode] Freeze screen unlocked by secret gesture.');
        router.replace('/(tabs)');
    };

    // 2. Detect upward swipe
    const panGesture = Gesture.Pan()
        .runOnJS(true)
        .onEnd((e) => {
            // Check if user swiped UP significantly (negative Y translation)
            if (e.translationY < -120) {
                console.info('[covertMode] Swipe up detected (distance: ' + Math.abs(e.translationY) + ')');

                if (tapsDetected >= 2) {
                    console.info('[covertMode] Unlock gesture successful');
                    handleWake();
                } else {
                    console.info('[covertMode] Swipe rejected: prerequisites not met.');
                }
            } else {
                console.info('[covertMode] Gesture movement not recognised as valid swipe up.');
            }
        });

    // We compose the gestures using "Simultaneous" so tap and pan can coexist independently.
    const composedGesture = Gesture.Simultaneous(tapSequence, panGesture);

    return (
        <GestureDetector gesture={composedGesture}>
            <View style={styles.container}>
                <Stack.Screen options={{ headerShown: false }} />
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
        </GestureDetector>
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
