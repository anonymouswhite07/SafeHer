import AsyncStorage from '@/services/storageService';

const STORAGE_KEY = '@safeher_guardian_contacts';
const MAX_CONTACTS = 3;

/**
 * Retrieve all saved guardian contacts from AsyncStorage.
 * @returns {Promise<Array>} Array of contact objects
 */
export async function getContacts() {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw);
    } catch (error) {
        console.error('[contactService] getContacts error:', error);
        return [];
    }
}

/**
 * Save (add or update) a guardian contact.
 * - If a contact with the same id exists, it is updated.
 * - If no id is provided, a new contact is created (max 3 allowed).
 *
 * @param {{ id?: string, name: string, phone: string }} contact
 * @returns {Promise<{ success: boolean, message: string, contacts: Array }>}
 */
export async function saveContact(contact) {
    try {
        if (!contact.name || !contact.name.trim()) {
            return { success: false, message: 'Name is required.', contacts: [] };
        }
        if (!contact.phone || !contact.phone.trim()) {
            return { success: false, message: 'Phone number is required.', contacts: [] };
        }

        const existing = await getContacts();

        if (contact.id) {
            // Update existing
            const updated = existing.map((c) =>
                c.id === contact.id
                    ? { ...c, name: contact.name.trim(), phone: contact.phone.trim() }
                    : c
            );
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            return { success: true, message: 'Contact updated.', contacts: updated };
        } else {
            // Add new
            if (existing.length >= MAX_CONTACTS) {
                return {
                    success: false,
                    message: `You can only save up to ${MAX_CONTACTS} guardian contacts.`,
                    contacts: existing,
                };
            }
            const newContact = {
                id: `contact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                name: contact.name.trim(),
                phone: contact.phone.trim(),
                createdAt: Date.now(),
            };
            const updated = [...existing, newContact];
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            return { success: true, message: 'Contact saved.', contacts: updated };
        }
    } catch (error) {
        console.error('[contactService] saveContact error:', error);
        return { success: false, message: 'Failed to save contact.', contacts: [] };
    }
}

/**
 * Delete a guardian contact by id.
 *
 * @param {string} id - The contact's id
 * @returns {Promise<{ success: boolean, message: string, contacts: Array }>}
 */
export async function deleteContact(id) {
    try {
        const existing = await getContacts();
        const updated = existing.filter((c) => c.id !== id);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return { success: true, message: 'Contact deleted.', contacts: updated };
    } catch (error) {
        console.error('[contactService] deleteContact error:', error);
        return { success: false, message: 'Failed to delete contact.', contacts: [] };
    }
}

/**
 * Clear all guardian contacts.
 * @returns {Promise<void>}
 */
export async function clearAllContacts() {
    try {
        await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.error('[contactService] clearAllContacts error:', error);
    }
}
