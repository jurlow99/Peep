import { describe, expect, it } from 'vitest';
import { parseSeasonFolder, parseEpisodeFile, planSeriesImport, STATUS } from './seriesImport';

const f = (path: string, size = 1000) => ({ name: path.split('/').pop()!, size, path });

describe('series folder import', () => {
  it('reads season folders and episode codes in the common shapes', () => {
    expect(parseSeasonFolder('Season 2')).toBe(2);
    expect(parseSeasonFolder('S03')).toBe(3);
    expect(parseSeasonFolder('series 1')).toBe(1);
    expect(parseSeasonFolder('Extras')).toBeNull();
    expect(parseEpisodeFile("S02E01 They're Back.mp4")).toMatchObject({ season: 2, episode: 1, title: "They're Back" });
    expect(parseEpisodeFile('The.Show.1x07.Birthday.Bash.mp4')).toMatchObject({ season: 1, episode: 7, title: 'The Show Birthday Bash' });
    expect(parseEpisodeFile('Episode 3 - Busted.mp4')).toMatchObject({ season: null, episode: 3, title: 'Busted' });
    expect(parseEpisodeFile('03 - Life In The Can.mp4')).toMatchObject({ season: null, episode: 3, title: 'Life In The Can' });
    expect(parseEpisodeFile('S01E04.mp4')).toMatchObject({ season: 1, episode: 4, title: 'Episode 4' });
    expect(parseEpisodeFile('Season 4  trailer #1.mp4')).toBeNull();
    expect(parseEpisodeFile('Choomah Island 2 TRAILER.mp4')).toBeNull();
  });

  it('plans a show folder, matches an existing series and flags what it cannot take', () => {
    const files = [
      f('The Big Lez Show/Season 1/S01E01 The Flowers.mp4'),
      f('The Big Lez Show/Season 1/S01E02 Sassy.mp4', 5000),
      f('The Big Lez Show/Season 2/S02E01 They\'re Back.mp4', 7000),
      f('The Big Lez Show/Season 2/S02E02 Extra.mkv'),
      f('The Big Lez Show/Season 3/Choomah Island 2 TRAILER.mp4'),
      f('The Big Lez Show/Season 3/.DS_Store'),
      f('The Big Lez Show/Specials/01 - Pilot.mp4', 100),
    ];
    const plan = planSeriesImport(files, [{ id: 4, title: 'the big lez show', episodes: [{ season: 1, episode_number: 1 }] }]);
    expect(plan.showTitle).toBe('The Big Lez Show');
    expect(plan.show?.id).toBe(4);
    // The "Specials" pilot has no season folder, so it lands on 1x1 too — already taken.
    // …and the Season 3 trailer becomes the first item on the Extras shelf (season 0, listed last).
    expect(plan.episodes.map(e => [e.season, e.number, e.status])).toEqual([[1, 1, STATUS.EXISTS], [1, 1, STATUS.EXISTS], [1, 2, STATUS.READY], [2, 1, STATUS.READY], [0, 1, STATUS.READY]]);
    expect(plan.skipped.map(s => s.status)).toEqual([STATUS.UNSUPPORTED]);
    expect(plan.ready).toBe(2);
    expect(plan.extras).toBe(1);
    expect(plan.bytes).toBe(5000 + 7000 + 1000);
    expect(plan.seasons).toEqual([1, 2, 0]);
  });

  it('drops the show name from episode titles and calms shouting file names', () => {
    const plan = planSeriesImport([
      f('Sassy The Sasquatch/SASSY THE SASQUATCH EP01 SEEN A DINOSAUR.mp4'),
      f('Sassy The Sasquatch/SASSY THE SASQUATCH ｜ EP06 ｜ AS ABOING SO BADOING.mp4'),
      f('Sassy The Sasquatch/Behind the Scenes of SASSY THE SASQUATCH.mp4'),
    ]);
    expect(plan.episodes.map(e => e.title)).toEqual(['Seen A Dinosaur', 'As Aboing So Badoing', 'Behind the Scenes of SASSY THE SASQUATCH']);
    expect(plan.episodes.map(e => `${e.season}x${e.number}`)).toEqual(['1x1', '1x6', '0x1']);
  });

  it('falls back to season 1 and a new series when nothing matches', () => {
    const plan = planSeriesImport([f('Night Shift/01 - Arrival.mp4'), f('Night Shift/02 - Arrival again.mp4')], [{ id: 9, title: 'Other' }]);
    expect(plan.show).toBeNull();
    expect(plan.showTitle).toBe('Night Shift');
    expect(plan.episodes.map(e => `${e.season}x${e.number} ${e.title}`)).toEqual(['1x1 Arrival', '1x2 Arrival again']);
  });

  it('refuses two files that claim the same episode', () => {
    const plan = planSeriesImport([f('Show/Season 1/S01E01 A.mp4'), f('Show/Season 1/S01E01 B.mp4')]);
    expect(plan.episodes).toHaveLength(1);
    expect(plan.skipped[0].reason).toContain('already S1E1');
  });

  it('explains an original that already has a converted MP4 twin instead of asking for a conversion', () => {
    const plan = planSeriesImport([f('Show/Season 4/S04E03 Vinally.webm'), f('Show/Season 4/S04E03 Vinally.mp4'), f('Show/Season 4/S04E06 Lost.mkv')]);
    expect(plan.episodes.map(e => e.name)).toEqual(['S04E03 Vinally.mp4']);
    const twin = plan.skipped.find(s => s.name.endsWith('.webm'));
    expect(twin?.converted).toBe(true);
    expect(twin?.reason).toContain('MP4 version next to it is used instead');
    expect(plan.skipped.find(s => s.name.endsWith('.mkv'))?.reason).toContain('Convert it');
  });

  it('sends trailers to the Extras shelf instead of an episode slot, and prefers the explicit code when names collide', () => {
    const plan = planSeriesImport([
      f('Show/Season 4/Season 4 ep2 trailer.mp4'),
      f('Show/Season 4/Season 4 trailer #2.mp4'),
      f('Show/Season 4/S04E02 Plac-Key.mp4'),
      f('Show/Season 4/Episode 3 Vinally.mp4'),
      f('Show/Season 4/S04E03 Vinally.mp4'),
    ]);
    expect(plan.episodes.map(e => `${e.season}x${e.number} ${e.name}`)).toEqual([
      '4x2 S04E02 Plac-Key.mp4', '4x3 S04E03 Vinally.mp4', '0x1 Season 4 ep2 trailer.mp4', '0x2 Season 4 trailer #2.mp4',
    ]);
    expect(plan.episodes.filter(e => e.extra).map(e => e.title)).toEqual(['Season 4 ep2 trailer', 'Season 4 trailer #2']);
    expect(plan.seasons).toEqual([4, 0]);
    expect(plan.ready).toBe(2); expect(plan.extras).toBe(2);
    expect(plan.skipped.map(s => s.name)).toEqual(['Episode 3 Vinally.mp4']);
    expect(plan.skipped[0].reason).toContain('"S04E03 Vinally.mp4" is already S4E3');
  });

  it('numbers new extras after the ones a series already has and leaves repeats alone', () => {
    const existing = [{ id: 4, title: 'Show', episodes: [{ season: 0, episode_number: 1, title: 'Choomah Island 2 Trailer' }, { season: 0, episode_number: 2, title: 'Blooper reel' }] }];
    const plan = planSeriesImport([f('Show/Season 3/Choomah Island 2 TRAILER.mp4'), f('Show/Season 4/Teaser Trailer #1.mp4')], existing);
    expect(plan.episodes.map(e => [e.number, e.status, e.title])).toEqual([[0, STATUS.EXISTS, 'Choomah Island 2 TRAILER'], [3, STATUS.READY, 'Teaser Trailer #1']]);
  });
});
