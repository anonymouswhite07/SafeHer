import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@/services/storageService';
import * as Haptics from 'expo-haptics';
import { Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import {
    startMotionMonitoring,
    stopMotionMonitoring,
} from '@/services/sensorService';

export interface EmergencyContact {
    id: string;
    name: string;
    phone: string;
    relation: string;
    avatar?: string;
}

export interface SafeZone {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius: number; // in meters
}

export interface TripRecord {
    id: string;
    startTime: number;
    endTime?: number;
    destination?: string;
    isActive: boolean;
}

interface SafeHerContextType {
    // Emergency Contacts
    contacts: EmergencyContact[];
    addContact: (contact: Omit<EmergencyContact, 'id'>) => Promise<void>;
    removeContact: (id: string) => Promise<void>;
    updateContact: (id: string, contact: Partial<EmergencyContact>) => Promise<void>;

    // SOS
    sosActive: boolean;
    triggerSOS: () => void;
    cancelSOS: () => void;
    sosCountdown: number;

    // Safe Zones
    safeZones: SafeZone[];
    addSafeZone: (zone: Omit<SafeZone, 'id'>) => Promise<void>;
    removeSafeZone: (id: string) => Promise<void>;

    // Trip
    activeTrip: TripRecord | null;
    startTrip: (destination?: string) => Promise<void>;
    endTrip: () => Promise<void>;

    // Settings
    shakeToSOS: boolean;
    setShakeToSOS: (val: boolean) => Promise<void>;
    fakeCallEnabled: boolean;
    setFakeCallEnabled: (val: boolean) => Promise<void>;

    // User profile
    userName: string;
    setUserName: (name: string) => Promise<void>;
    userPhone: string;
    setUserPhone: (phone: string) => Promise<void>;

    // Motion / Sensor
    motionActive: boolean;
    lastMotionEvent: MotionEventSnapshot | null;
}

export interface MotionEventSnapshot {
    type: 'SHAKE' | 'IMPACT' | 'RAPID_MOVEMENT';
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    magnitude: number;
    net: number;
    description: string;
    timestamp: number;
}

const SafeHerContext = createContext<SafeHerContextType | null>(null);

const STORAGE_KEYS = {
    CONTACTS: '@safeher_contacts',
    SAFE_ZONES: '@safeher_safe_zones',
    SHAKE_SOS: '@safeher_shake_sos',
    FAKE_CALL: '@safeher_fake_call',
    USER_NAME: '@safeher_user_name',
    USER_PHONE: '@safeher_user_phone',
};

export function SafeHerProvider({ children }: { children: React.ReactNode }) {
    const [contacts, setContacts] = useState<EmergencyContact[]>([]);
    const [safeZones, setSafeZones] = useState<SafeZone[]>([]);
    const [sosActive, setSosActive] = useState(false);
    const [sosCountdown, setSosCountdown] = useState(5);
    const [activeTrip, setActiveTrip] = useState<TripRecord | null>(null);
    const [shakeToSOS, setShakeToSOSState] = useState(true);
    const [fakeCallEnabled, setFakeCallEnabledState] = useState(true);
    const [userName, setUserNameState] = useState('');
    const [userPhone, setUserPhoneState] = useState('');

    // Motion sensor state
    const [motionActive, setMotionActive] = useState(false);
    const [lastMotionEvent, setLastMotionEvent] = useState<MotionEventSnapshot | null>(null);
    const motionStopRef = useRef<(() => void) | null>(null);
    const sosTriggeredRef = useRef(false);  // prevent duplicate SOS from rapid events

    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Load persisted data
    useEffect(() => {
        (async () => {
            try {
                const [
                    storedContacts,
                    storedZones,
                    storedShake,
                    storedFakeCall,
                    storedName,
                    storedPhone,
                ] = await Promise.all([
                    AsyncStorage.getItem(STORAGE_KEYS.CONTACTS),
                    AsyncStorage.getItem(STORAGE_KEYS.SAFE_ZONES),
                    AsyncStorage.getItem(STORAGE_KEYS.SHAKE_SOS),
                    AsyncStorage.getItem(STORAGE_KEYS.FAKE_CALL),
                    AsyncStorage.getItem(STORAGE_KEYS.USER_NAME),
                    AsyncStorage.getItem(STORAGE_KEYS.USER_PHONE),
                ]);

                if (storedContacts) setContacts(JSON.parse(storedContacts));
                if (storedZones) setSafeZones(JSON.parse(storedZones));
                if (storedShake !== null) setShakeToSOSState(JSON.parse(storedShake));
                if (storedFakeCall !== null) setFakeCallEnabledState(JSON.parse(storedFakeCall));
                if (storedName) setUserNameState(storedName);
                if (storedPhone) setUserPhoneState(storedPhone);
            } catch (e) {
                console.error('Failed to load SafeHer data', e);
            }
        })();
    }, []);

    // ── Shake-to-SOS accelerometer watcher ─────────────────────────────────────
    useEffect(() => {
        if (shakeToSOS) {
            _startSensorIfNeeded();
        } else {
            _stopSensor();
        }
        return () => { _stopSensor(); };
    }, [shakeToSOS]);  // eslint-disable-line react-hooks/exhaustive-deps

    const _startSensorIfNeeded = async () => {
        if (motionActive) return;
        sosTriggeredRef.current = false;
        const handle = await startMotionMonitoring(
            (event: any) => {
                // Update last event for UI display
                setLastMotionEvent({
                    type: event.type,
                    severity: event.severity,
                    magnitude: event.magnitude,
                    net: event.net,
                    description: event.description,
                    timestamp: Date.now(),
                });

                // Only HIGH-severity events trigger SOS (avoid false positives)
                if (
                    event.severity === 'HIGH' &&
                    !sosTriggeredRef.current &&
                    !sosActive
                ) {
                    sosTriggeredRef.current = true;
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    // Brief guard so double-events don't stack
                    setTimeout(() => { sosTriggeredRef.current = false; }, 4000);
                    router.push('/sos');
                }
            },
            (err: Error) => {
                console.error('[SafeHerContext] Sensor error:', err.message);
                setMotionActive(false);
            }
        );
        motionStopRef.current = handle?.stop ?? null;
        setMotionActive(true);
    };

    const _stopSensor = () => {
        if (motionStopRef.current) {
            motionStopRef.current();
            motionStopRef.current = null;
        }
        stopMotionMonitoring();
        setMotionActive(false);
    };

    // Emergency Contacts
    const addContact = useCallback(async (contact: Omit<EmergencyContact, 'id'>) => {
        const newContact: EmergencyContact = { ...contact, id: Date.now().toString() };
        const updated = [...contacts, newContact];
        setContacts(updated);
        await AsyncStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(updated));
    }, [contacts]);

    const removeContact = useCallback(async (id: string) => {
        const updated = contacts.filter(c => c.id !== id);
        setContacts(updated);
        await AsyncStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(updated));
    }, [contacts]);

    const updateContact = useCallback(async (id: string, updates: Partial<EmergencyContact>) => {
        const updated = contacts.map(c => c.id === id ? { ...c, ...updates } : c);
        setContacts(updated);
        await AsyncStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(updated));
    }, [contacts]);

    // SOS
    const triggerSOS = useCallback(() => {
        if (sosActive) return;
        setSosActive(true);
        setSosCountdown(5);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

        let count = 5;
        countdownRef.current = setInterval(() => {
            count -= 1;
            setSosCountdown(count);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            if (count <= 0) {
                clearInterval(countdownRef.current!);
                // In production: send SMS, call emergency, share location
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
        }, 1000);
    }, [sosActive]);

    const cancelSOS = useCallback(() => {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setSosActive(false);
        setSosCountdown(5);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, []);

    // Safe Zones
    const addSafeZone = useCallback(async (zone: Omit<SafeZone, 'id'>) => {
        const newZone: SafeZone = { ...zone, id: Date.now().toString() };
        const updated = [...safeZones, newZone];
        setSafeZones(updated);
        await AsyncStorage.setItem(STORAGE_KEYS.SAFE_ZONES, JSON.stringify(updated));
    }, [safeZones]);

    const removeSafeZone = useCallback(async (id: string) => {
        const updated = safeZones.filter(z => z.id !== id);
        setSafeZones(updated);
        await AsyncStorage.setItem(STORAGE_KEYS.SAFE_ZONES, JSON.stringify(updated));
    }, [safeZones]);

    // Trip
    const startTrip = useCallback(async (destination?: string) => {
        const trip: TripRecord = {
            id: Date.now().toString(),
            startTime: Date.now(),
            destination,
            isActive: true,
        };
        setActiveTrip(trip);
    }, []);

    const endTrip = useCallback(async () => {
        if (activeTrip) {
            setActiveTrip({ ...activeTrip, endTime: Date.now(), isActive: false });
            setTimeout(() => setActiveTrip(null), 3000);
        }
    }, [activeTrip]);

    // Settings
    const setShakeToSOS = useCallback(async (val: boolean) => {
        setShakeToSOSState(val);
        await AsyncStorage.setItem(STORAGE_KEYS.SHAKE_SOS, JSON.stringify(val));
    }, []);

    const setFakeCallEnabled = useCallback(async (val: boolean) => {
        setFakeCallEnabledState(val);
        await AsyncStorage.setItem(STORAGE_KEYS.FAKE_CALL, JSON.stringify(val));
    }, []);

    const setUserName = useCallback(async (name: string) => {
        setUserNameState(name);
        await AsyncStorage.setItem(STORAGE_KEYS.USER_NAME, name);
    }, []);

    const setUserPhone = useCallback(async (phone: string) => {
        setUserPhoneState(phone);
        await AsyncStorage.setItem(STORAGE_KEYS.USER_PHONE, phone);
    }, []);

    return (
        <SafeHerContext.Provider value={{
            contacts, addContact, removeContact, updateContact,
            sosActive, triggerSOS, cancelSOS, sosCountdown,
            safeZones, addSafeZone, removeSafeZone,
            activeTrip, startTrip, endTrip,
            shakeToSOS, setShakeToSOS,
            fakeCallEnabled, setFakeCallEnabled,
            userName, setUserName,
            userPhone, setUserPhone,
            motionActive, lastMotionEvent,
        }}>
            {children}
        </SafeHerContext.Provider>
    );
}

export function useSafeHer() {
    const ctx = useContext(SafeHerContext);
    if (!ctx) throw new Error('useSafeHer must be used within SafeHerProvider');
    return ctx;
}
