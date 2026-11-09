// Feedback (F15): the key, the note queue, and sending to the feedback inbox.
//
// Neither of these is in BACKUP_KEYS (backup.js), on purpose: the key is a
// secret that must never end up in a backup file on Drive, and the notes
// live in the inbox sheet once sent. Restore only touches BACKUP_KEYS, so a
// restore leaves both alone.
export const KEY_STORE = 'reproom.feedbackKey';   // the key, pasted once on the phone
export const NOTES_STORE = 'reproom.feedback';    // recent notes, queued or sent
