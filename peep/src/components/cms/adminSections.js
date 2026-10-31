// Keep navigation separate from the CMS's existing rendering and data operations.
export const ADMIN_NAV = [
  { key: 'content', label: 'Content', description: 'Manage the movies, series and podcasts available to viewers.', sections: [
    { key: 'storage', label: 'Add VOD', target: { tab: 'storage' } },
    { key: 'movies', label: 'Movies', target: { tab: 'content', videoSubTab: 'shorts' } },
    { key: 'series', label: 'Series', target: { tab: 'content', videoSubTab: 'series' } },
    { key: 'episodes', label: 'Episodes', target: { tab: 'content', videoSubTab: 'episodes' } },
    { key: 'podcasts', label: 'Podcasts', target: { tab: 'content', videoSubTab: 'podcasts' } },
  ] },
  { key: 'curation', label: 'Curation', description: 'Arrange viewer screens, hero artwork and personalized rows such as Continue Watching.', sections: [
    { key: 'screens', label: 'Screens & rows', target: { tab: 'content', videoSubTab: 'carousels' } },
  ] },
  { key: 'live', label: 'Live TV', description: 'Manage channel sources, channel availability, schedules and multiview packages.', sections: [
    { key: 'channels', label: 'Channels & schedules', target: { tab: 'live', liveSubTab: 'channels' } },
    { key: 'feeds', label: 'Feeds', target: { tab: 'live', liveSubTab: 'feeds' } },
    { key: 'multiview', label: 'Multiview packages', target: { tab: 'content', videoSubTab: 'multiview' } },
    { key: 'predictions', label: 'Predictions', target: { tab: 'events' } },
  ] },
  { key: 'partners', label: 'Partners', description: 'Manage content partners, submissions and creator broadcasting.', sections: [
    { key: 'partners', label: 'Content partners', target: { tab: 'creators', creatorsTab: 'list' } },
    { key: 'deliveries', label: 'Provider deliveries', target: { tab: 'creators', creatorsTab: 'deliveries' } },
    { key: 'review', label: 'Submission review', target: { tab: 'creators', creatorsTab: 'review' } },
    { key: 'streams', label: 'Creator streams', target: { tab: 'live', liveSubTab: 'streams' } },
    { key: 'applications', label: 'Streaming applications', target: { tab: 'live', liveSubTab: 'applications' } },
  ] },
  { key: 'audience', label: 'Audience', description: 'Manage viewer accounts, support requests and content moderation.', sections: [
    { key: 'users', label: 'Users', target: { tab: 'members', membersTab: 'users' } },
    { key: 'support', label: 'Support', target: { tab: 'members', membersTab: 'support' } },
    { key: 'moderation', label: 'Content reports', target: { tab: 'moderation' } },
  ] },
  { key: 'monetization', label: 'Monetization', description: 'Configure advertising, manage subscriptions and track partner payouts.', sections: [
    { key: 'ads', label: 'Ads', target: { tab: 'ads' } },
    { key: 'subscriptions', label: 'Subscriptions', target: { tab: 'members', membersTab: 'subscriptions' } },
    { key: 'payouts', label: 'Partner payouts', target: { tab: 'creators', creatorsTab: 'payouts' } },
  ] },
  { key: 'reports', label: 'Reports', description: 'Monitor platform activity and Live TV viewing, including multiview.', sections: [
    { key: 'live_tv', label: 'Live TV viewing', target: { tab: 'analytics', analyticsTab: 'live_tv' } },
    { key: 'analytics', label: 'Platform analytics', target: { tab: 'analytics', analyticsTab: 'reports' } },
  ] },
  { key: 'platform', label: 'Platform', description: 'Manage platform settings, access, security and technical operations.', sections: [
    { key: 'settings', label: 'Settings & admin access', target: { tab: 'settings' } },
    { key: 'security', label: 'Security', target: { tab: 'security' } },
    { key: 'flags', label: 'Feature flags', target: { tab: 'flags' } },
    { key: 'audit', label: 'Audit log', target: { tab: 'audit' } },
    { key: 'planned', label: 'Planned tools', target: { tab: 'scaffold' } },
  ] },
];

export function targetMatches(target, state) {
  return Object.entries(target).every(([key, value]) => state[key] === value);
}

export function activeAdminLocation(state) {
  for (const group of ADMIN_NAV) {
    const page = group.sections.find(page => targetMatches(page.target, state));
    if (page) return { group, page };
  }
  return { group: ADMIN_NAV[0], page: ADMIN_NAV[0].sections[0] };
}
