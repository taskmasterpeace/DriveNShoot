// THE RADIO as rows (docs/design/WEB_VOICE_STATS.md §3.6). Stations you tune in a vehicle, or anywhere with a portable
// radio in your pack: music composed for the game (tools/radio-compose.mjs -> public/music/, data/music-manifest.json),
// station IDs between songs, a faction's propaganda, the news read off the world's own memory, and an emergency
// broadcast that offers shelter - sometimes honestly. Our own words throughout; tools/ip-lint.mjs scans them.
//   kind    music (a playlist) | propaganda (a playlist + its faction's lines) | news (static + headlines from the
//           chronicle) | emergency (an alert tone + a shelter at a real place; trap: the share of days it is a lure)
//   filter  fm (a little top cut) | am (a narrow band: 300-3400 Hz, the voice of a cheap speaker)
//   ids     lines between songs (a stinger, the line on the subtitle; heard as a voice once the forge renders it)
import MUSIC from './music-manifest.json';

export const MUSIC_MANIFEST = MUSIC;
export const MUSIC_BASE = 'music/';

export const STATIONS = [
  { id: 'off', name: 'RADIO OFF' },
  { id: 'kdst', freq: '98.1 FM', name: 'KDST DUST COUNTRY', kind: 'music', playlist: 'kdst', filter: 'fm', idEvery: [70, 120], ids: [
    'KDST, ninety-eight one. The only thing still playing on the Glass Flats.',
    'Dust Country, KDST. If you can hear this, your battery still works. Be grateful.',
    'This is KDST. We play what we found. We found this.',
    'Ninety-eight one KDST. Keep the windows up and the tank full.',
    'KDST. Coming to you from a tower nobody has taken yet.',
  ] },
  { id: 'relay', freq: '104.5 FM', name: 'THE RELAY', kind: 'music', playlist: 'relay', filter: 'fm', idEvery: [90, 150], ids: [
    'The Relay, one-oh-four five. For the ones still driving after dark.',
    'You are on The Relay. Lights off past the ridge, friend.',
    'One-oh-four five. Slow songs for long roads.',
    'The Relay. Nobody knows where the mast is. Keep it that way.',
  ] },
  { id: 'remnant', freq: '1220 AM', name: 'VOICE OF THE REMNANT', kind: 'propaganda', playlist: 'remnant', filter: 'am', faction: 'remnant', idEvery: [45, 80], ids: [
    'This is the Voice of the Remnant. Order is coming back to the roads.',
    'The Federal Remnant is recruiting. Three meals, a rifle, a reason.',
    'Report raider movement to any Remnant post. Your service will be remembered.',
    'The flag still flies at Outpost Nine. It will fly over your town too.',
    'Citizens: ration water, register vehicles, obey the curfew. The Remnant protects.',
    'Every road the Remnant holds is a road your children can drive.',
  ] },
  { id: 'static', freq: '1660 AM', name: 'STATIC 1660 AM', kind: 'news', filter: 'am', idEvery: [35, 55], ids: [
    'Static here. Nothing on the wire but the wind.',
    'Static, sixteen-sixty. If you know something, I want to know it.',
    'This is Static. Keep your water close and your mouth shut.',
  ] },
  { id: 'emergency', freq: '162.5', name: 'EMERGENCY BROADCAST', kind: 'emergency', filter: 'am', idEvery: [20, 30], trap: 0.4, ids: [
    'This is an emergency broadcast. Shelter, water and medicine at {place}. Come alone. Come unarmed.',
    'Emergency broadcast. Survivors are gathering at {place}. There is room. Come now.',
    'If you can hear this: {place}. Water. A doctor. Safety. Repeat: {place}.',
  ] },
];

// Tuning and sound.
export const RADIO = {
  volume: 0.6,          // default (the setting persists in localStorage dsoa.radio.vol)
  crossfade: 2.5,       // s between songs
  duck: 0.35,           // music level under a station ID
  idSecs: 5,            // how long an ID holds the subtitle
  am: { lo: 320, hi: 3200 }, fm: { hi: 9000 },
  trapRange: 36,        // m: walk this close to a false shelter and the lure is sprung
  trapCount: 4,         // raiders waiting
  shelterR: [220, 900], // m from you: where the broadcast's shelter is
  item: 'radio_portable',
};
