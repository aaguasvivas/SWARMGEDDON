/**
 * Leaderboard name blocklist (section 8.4). OWNER: review this list before the
 * v2 deploy (spec section 0, item 2).
 *
 * A name is folded first: NFKD with diacritics removed, lowercase, then leet
 * digits and symbols mapped to letters. SUBSTRINGS match anywhere in the
 * folded name with every non-letter removed, so `F.U.C.K` and `sh1t_head`
 * match. WORDS match only a whole run of letters, because they are common
 * inside innocent words (`class`, `grape`, `dickens`).
 */
const SUBSTRINGS = [
  'fuck', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'fagot', 'retard', 'hitler',
  'siegheil', 'kkk', 'molest', 'penis', 'vagina', 'porn', 'jizz', 'twat', 'dildo', 'rapist', 'chink', 'kike',
  'tranny', 'pendej', 'verga', 'chinga', 'mierda', 'maricon', 'culero', 'cabron', 'zorra', 'panocha',
]
const WORDS = [
  'ass', 'asshole', 'dick', 'fag', 'rape', 'nazi', 'cum', 'tits', 'coon', 'gook', 'cock', 'pedo', 'spic', 'fuk',
  'wank', 'puta', 'puto', 'culo', 'pito', 'mamon', 'joto',
]

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't' }

function fold(name: string): string {
  let out = ''
  for (const ch of name.normalize('NFKD').toLowerCase()) {
    const c = ch.codePointAt(0) ?? 0
    if (c >= 0x300 && c <= 0x36f) continue
    out += LEET[ch] ?? ch
  }
  return out
}

export function blocked(name: string): boolean {
  const f = fold(name)
  const letters = f.replace(/[^a-z]/g, '')
  if (SUBSTRINGS.some((w) => letters.includes(w))) return true
  const words = f.split(/[^a-z]+/)
  return words.some((w) => WORDS.includes(w))
}
