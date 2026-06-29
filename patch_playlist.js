const fs = require('fs');
let content = fs.readFileSync('client/src/model/state/onair/OnAirSelectStreamState.ts', 'utf8');

const oldPlaylistUrlLogic = `return \`/api/streams/live/\\$\\{channel.id.toString\\(10\\)\\}/m2ts/playlist\\?mode=\\$\\{this.selectedStreamConfig\\}\`;`;
const newPlaylistUrlLogic = `return \`/api/streams/live/\${channel.id.toString(10)}/\${(this.selectedStreamType || 'm2ts').toLowerCase()}/playlist?mode=\${this.selectedStreamConfig}\`;`;

content = content.replace(new RegExp(oldPlaylistUrlLogic, 'g'), newPlaylistUrlLogic);
fs.writeFileSync('client/src/model/state/onair/OnAirSelectStreamState.ts', content);
