// Keep navigation separate from the CMS's existing rendering and data operations.
// One flow per page: a section is one job, not a stack of tools.
export const ADMIN_NAV = [
  { key: 'content', label: 'Content', description: 'Movies, series and podcasts that viewers can watch.', sections: [
    { key: 'storage', label: 'Add VOD', target: { tab: 'storage' } },
    { key: 'movies', label: 'Movies', target: { tab: 'content', videoSubTab: 'shorts' } },
    { key: 'series', label: 'Series', target: { tab: 'content', videoSubTab: 'series' } },
    { key: 'podcasts', label: 'Podcasts', target: { tab: 'content', videoSubTab: 'podcasts' } },
  ] },
  { key: 'curation', label: 'Curation', description: 'What each viewer screen shows: hero, rows and their order.', sections: [
    { key: 'screens', label: 'Screens & rows', target: { tab: 'content', videoSubTab: 'carousels' } },
  ] },
  { key: 'live', label: 'Live TV', description: 'Channels, their guides and sources, multiview packages and prediction events.', sections: [
    { key: 'channels', label: 'Channels & schedules', target: { tab: 'live', liveSubTab: 'channels' } },
    { key: 'feeds', label: 'Feeds', target: { tab: 'live', liveSubTab: 'feeds' } },
    { key: 'moments', label: 'Live moments', target: { tab: 'live', liveSubTab: 'moments' } },
    { key: 'multiview', label: 'Multiview packages', target: { tab: 'content', videoSubTab: 'multiview' } },
    { key: 'predictions', label: 'Predictions', target: { tab: 'events' } },
  ] },
  { key: 'partners', label: 'Partners', description: 'Content partners, what they deliver, and creator broadcasting.', sections: [
    { key: 'partners', label: 'Content partners', target: { tab: 'creators', creatorsTab: 'list' } },
    { key: 'deliveries', label: 'Provider deliveries', target: { tab: 'creators', creatorsTab: 'deliveries' } },
    { key: 'streams', label: 'Creator streams', target: { tab: 'live', liveSubTab: 'streams' } },
    { key: 'applications', label: 'Streaming applications', target: { tab: 'live', liveSubTab: 'applications' } },
  ] },
  { key: 'audience', label: 'Audience', description: 'Viewer accounts, support and reports from viewers.', sections: [
    { key: 'users', label: 'Users', target: { tab: 'members', membersTab: 'users' } },
    { key: 'support', label: 'Support', target: { tab: 'members', membersTab: 'support' } },
    { key: 'moderation', label: 'Content reports', target: { tab: 'moderation' } },
  ] },
  { key: 'monetization', label: 'Monetization', description: 'Ads, subscriptions, promo codes and what partners are paid.', sections: [
    { key: 'ad_rules', label: 'Ad rules', target: { tab: 'ads' } },
    { key: 'ad_tags', label: 'Ad tags', target: { tab: 'ad_tags' } },
    { key: 'ad_delivery', label: 'Ad delivery', target: { tab: 'ad_delivery' } },
    { key: 'subscriptions', label: 'Subscriptions', target: { tab: 'members', membersTab: 'subscriptions' } },
    { key: 'promos', label: 'Promo codes & comps', target: { tab: 'promos' } },
    { key: 'payouts', label: 'Partner payouts', target: { tab: 'creators', creatorsTab: 'payouts' } },
  ] },
  { key: 'reports', label: 'Reports', description: 'Active users, minutes watched, channel and title stats.', sections: [
    { key: 'overview', label: 'Overview', target: { tab: 'analytics', analyticsTab: 'overview' } },
    { key: 'mau', label: 'MAU', target: { tab: 'analytics', analyticsTab: 'mau' } },
    { key: 'channels', label: 'Channels', target: { tab: 'analytics', analyticsTab: 'channels' } },
    { key: 'titles', label: 'Titles', target: { tab: 'analytics', analyticsTab: 'titles' } },
    { key: 'live_tv', label: 'Watching now', target: { tab: 'analytics', analyticsTab: 'live_tv' } },
    { key: 'analytics', label: 'Viewer lookup', target: { tab: 'analytics', analyticsTab: 'reports' } },
  ] },
  { key: 'platform', label: 'Platform', description: 'Staff, settings, storage, security and the audit trail.', sections: [
    { key: 'staff', label: 'Staff', target: { tab: 'staff' } },
    { key: 'settings', label: 'Settings', target: { tab: 'settings' } },
    { key: 'storage_tools', label: 'Storage', target: { tab: 'storage_tools' } },
    { key: 'boss', label: 'Boss board', target: { tab: 'boss' } },
    { key: 'security', label: 'Security', target: { tab: 'security' } },
    { key: 'flags', label: 'Feature flags', target: { tab: 'flags' } },
    { key: 'audit', label: 'Audit log', target: { tab: 'audit' } },
    { key: 'planned', label: 'Planned tools', target: { tab: 'scaffold' } },
  ] },
];

export function targetMatches(target, state) {
  return Object.entries(target).every(([key, value]) => state[key] === value);
}

export function activeAdminLocation(state, nav = ADMIN_NAV) {
  for (const group of nav) {
    const page = group.sections.find(page => targetMatches(page.target, state));
    if (page) return { group, page };
  }
  return { group: nav[0], page: nav[0].sections[0] };
}
