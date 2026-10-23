// What a stranger will talk about (systems/talk.js). A review found every townsperson gave one line and [Leave]; now each
// has three topics drawn from the live world: the news their people heard (the chronicle), the road (the infected,
// the camps, the relay, the weather), and what their people make of you (standing, what you're known as).
// {who} the person it happened to, {place} where, {dir} a compass direction, {n} a count.

export const TOPICS = { news: 'Heard anything?', road: "What's it like out there?", you: 'What do folks make of me?' };

// The news: the newest record their people could know - one they saw themselves, one their people heard, or the world's.
export const NEWS = {
  saw: { // they were there: the record names them as a witness
    kill: 'I was there when you put {who} down. I see it when I close my eyes.',
    silence: 'I saw what you did to {who}. They saw something too, didn\'t they.',
    hurt: 'I saw you shoot {who}. Don\'t make me the next one.',
    rob: 'I watched you rob {who}. I\'m not saying anything. I\'m just saying I watched.',
    steal: 'I saw your hands in {who}\'s things.',
    carjack: 'I saw you drag {who} out of their car like a sack of feed.',
    rescue: 'I saw you pull {who} out of that mess at {place}. Not everybody would.',
    heal: 'I saw you patch up {who}. Kindness is rare out here. People notice.',
    threaten: 'You held a gun on {who}. I was there.',
    stunt: 'I saw you fly that car. Out of your mind, stranger. I loved it.',
  },
  heard: { // their people heard it (a report landed)
    kill: 'Word is somebody put {who} in the dirt at {place}. Folks are saying it was a stranger.',
    silence: 'Word is {who} saw something at {place} and now {who} is dead. People are counting the strangers.',
    hurt: 'Somebody shot {who} at {place}. A stranger, they say.',
    rob: 'Somebody robbed {who} at {place}. Keep your pack close.',
    steal: 'Somebody went through {who}\'s things at {place}. Locks don\'t mean what they used to.',
    carjack: 'Somebody yanked {who} out of their own car at {place}.',
    rescue: 'They say a stranger pulled {who} out of a bad fight at {place}.',
    heal: 'Somebody patched {who} up at {place} and asked nothing for it. Strange times.',
    deliver: 'Somebody brought {who} what they needed at {place}. Good for them.',
    stunt: 'People keep talking about a car that flew over {who} at the old thrill show.',
  },
  world: {
    kill: '{who} got killed out at {place}. Nobody\'s surprised anymore.',
    downed: '{who} went down at {place}. They\'ll get up. This time.',
  },
  none: 'Quiet, for once. I don\'t trust it.',
};

// The road: the nearest thing worth warning a stranger about, in this order.
export const ROAD = {
  herd: 'There\'s {n} of the dead {dir} of here. Walk, don\'t run. Some of them only look slow.',
  choir: 'Stay off the old relay mast {dir} of here after dark. The dead stand round it like they\'re listening to something.',
  camp: 'Dustwolves hold the camp {dir} of here. They\'ll see you before you see them.',
  weather: { STORM: 'Acid\'s coming down. Get under a roof and stay there.', RAIN: 'Rain\'s acid this season. Don\'t drink it, don\'t stand in it.', DUST: 'Dust like this, you can\'t see a buggy till it\'s on top of you.', FOG: 'Fog brings them close before you know it. The dead don\'t need eyes.' },
  quiet: 'Roads are as quiet as they get. That\'s not very.',
  near: { herd: 150, choir: 700, camp: 400 },
};

// What their people make of you: by the tier their faction reads you at.
export const YOU = {
  hunted: 'There\'s a price on you, stranger. I\'d leave before somebody collects.',
  hostile: 'People here want you gone. I\'d walk soft.',
  wary: 'Folks are watching you. You haven\'t earned much.',
  neutral: 'Nobody knows what to make of you yet. Out here that\'s not the worst thing.',
  friendly: 'People here are glad you\'re around. Don\'t make them regret it.',
  allied: 'Folks here would stand with you. That\'s worth more than water.',
};
