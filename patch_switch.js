const fs = require('fs');
let content = fs.readFileSync('client/src/components/onair/OnAirSelectStream.vue', 'utf8');

const oldDiv = `<div class="d-flex">
                        <v-switch value v-model="dialogState.useURLScheme" v-on:change="updateAllStreamConfig"></v-switch>`;
const newDiv = `<div class="d-flex" v-if="dialogState.selectedStreamType !== 'M2TS-LL' && dialogState.selectedStreamType !== 'HLS'">
                        <v-switch value v-model="dialogState.useURLScheme" v-on:change="updateAllStreamConfig"></v-switch>`;

content = content.replace(oldDiv, newDiv);
fs.writeFileSync('client/src/components/onair/OnAirSelectStream.vue', content);
