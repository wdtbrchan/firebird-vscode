/**
 * Parses the argument passed to `firebird.connectSlot` and returns a slot
 * number in the range 1..9, or `null` if the input is not a valid slot.
 *
 * Accepted forms:
 *   - a plain number (1..9)
 *   - a numeric string ("1".."9")
 *   - an object `{ slot: 1..9 }` (also tolerates a numeric string for slot)
 *
 * The object form is what `keybindings[].args` produces in package.json.
 */
export function parseSlotArg(arg: unknown): number | null {
    let raw: unknown = arg;
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
        raw = (raw as { slot?: unknown }).slot;
    }

    let n: number;
    if (typeof raw === 'number') {
        n = raw;
    } else if (typeof raw === 'string' && /^-?\d+$/.test(raw)) {
        n = parseInt(raw, 10);
    } else {
        return null;
    }

    if (!Number.isInteger(n) || n < 1 || n > 9) return null;
    return n;
}
