// Empty filter means all enabled packages. Explicit picks preserve the admin's order.
export function packagesForRow(row, packages) {
  const available = packages.filter(p => p.enabled !== false);
  if (!row.filter_value) return available;
  try {
    const picks = JSON.parse(row.filter_value);
    return Array.isArray(picks) ? picks.flatMap(p => {
      const found = available.find(item => String(item.id) === String(p.id));
      return found ? [found] : [];
    }) : [];
  } catch { return []; }
}
export function packageChannelIDs(pkg) {
  const hasThird = pkg.third_channel_id != null;
  const hasFourth = pkg.fourth_channel_id != null;
  if (hasThird !== hasFourth) return [];
  const ids = [pkg.left_channel_id, pkg.right_channel_id];
  if (hasThird) ids.push(pkg.third_channel_id, pkg.fourth_channel_id);
  return ids;
}
export function packageChannels(pkg, channels) {
  const ids = packageChannelIDs(pkg);
  if (![2,4].includes(ids.length) || new Set(ids.map(String)).size !== ids.length) return [];
  const items = ids.map(id => channels.find(c => String(c.id) === String(id) && c.is_active !== false && !c.is_premium));
  return items.every(Boolean) ? items : [];
}
