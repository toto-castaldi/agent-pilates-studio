// Private .env configuration only. Callers must not include rejected values
// in errors or logs. A phone can be linked once; a teacher may have many phones.
export function parseTeacherLinks(value, allowedUsers) {
  if (typeof value !== 'string' || value !== value.trim() || value.length > 200_000) throw new Error('Invalid teacher links');
  const links = JSON.parse(value);
  if (!Array.isArray(links)) throw new Error('Invalid teacher links');
  const allowed = new Set(allowedUsers.split(','));
  const seen = new Set();
  const validName = (name) => typeof name === 'string' && name === name.trim() && name.length > 0
    && [...name].length <= 200 && !/\p{C}/u.test(name);
  for (const link of links) {
    if (!link || typeof link !== 'object' || Array.isArray(link)
      || Object.keys(link).sort().join(',') !== 'firstName,lastName,phone'
      || typeof link.phone !== 'string' || !/^\d+$/.test(link.phone)
      || !allowed.has(link.phone) || seen.has(link.phone)
      || !validName(link.firstName) || !validName(link.lastName)) throw new Error('Invalid teacher links');
    seen.add(link.phone);
  }
  return links.map(({ phone, firstName, lastName }) => ({ phone, firstName, lastName }));
}
