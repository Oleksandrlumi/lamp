// Dutch address lookup (postcode + house number -> street + city) using the
// free PDOK Locatieserver of the Dutch government (BAG data, no API key).
// https://api.pdok.nl/bzk/locatieserver/search/v3_1/ui/

const ENDPOINT = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';
const FIELDS = 'straatnaam,woonplaatsnaam,huisnummer,huisletter,huisnummertoevoeging,postcode';

export const NL_POSTCODE = /^[1-9][0-9]{3}\s?[A-Za-z]{2}$/;

export const normalizePostcode = (pc) => pc.replace(/\s+/g, '').toUpperCase();
export const formatPostcode = (pc) => {
  const n = normalizePostcode(pc);
  return n.length === 6 ? `${n.slice(0, 4)} ${n.slice(4)}` : pc.toUpperCase();
};

const additionOf = (doc) =>
  [doc.huisletter, doc.huisnummertoevoeging].filter(Boolean).join('-');

async function query(params, signal) {
  const url = `${ENDPOINT}?${params.toString()}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`PDOK ${res.status}`);
  const data = await res.json();
  return data?.response?.docs ?? [];
}

/**
 * Look up an address. Resolves to
 *   { street, city, postcode, additions: string[] }  when found,
 *   null                                              when not found.
 * Rejects on network errors.
 */
export async function lookupAddress(postcode, houseNumber, addition = '', signal) {
  const pc = normalizePostcode(postcode);
  const nr = String(houseNumber).replace(/\D/g, '');
  if (!NL_POSTCODE.test(pc) || !nr) return null;

  const params = new URLSearchParams();
  params.append('q', '*:*');
  params.append('fq', `postcode:${pc}`);
  params.append('fq', `huisnummer:${nr}`);
  params.append('fq', 'type:adres');
  params.append('fl', FIELDS);
  params.append('rows', '50');

  let docs = await query(params, signal);
  if (!docs.length) {
    // Fallback: free-text search, then filter client-side.
    const alt = new URLSearchParams({ q: `${pc} ${nr}`, fq: 'type:adres', fl: FIELDS, rows: '50' });
    docs = (await query(alt, signal)).filter(
      (d) => normalizePostcode(d.postcode || '') === pc && String(d.huisnummer) === nr,
    );
  }
  if (!docs.length) return null;

  const wanted = addition.trim().toUpperCase().replace(/\s+/g, '');
  const match =
    docs.find((d) => additionOf(d).toUpperCase().replace(/-/g, '') === wanted.replace(/-/g, '')) ??
    docs[0];
  const additions = [...new Set(docs.map(additionOf).filter(Boolean))].sort();

  return {
    street: match.straatnaam,
    city: match.woonplaatsnaam,
    postcode: formatPostcode(match.postcode || pc),
    additions,
  };
}
