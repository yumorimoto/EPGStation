const { spawn } = require('child_process');

/**
 * EPGStation Custom Encoding Script
 * Utilizes Intel Quick Sync Video (QSV) hardware encoding for H.264 at 1080i/p.
 * Intelligently handles Dual Mono and Multiple Audio Track broadcasts.
 *
 * Conforms to Google JavaScript Style Guide.
 */

// Environment variables passed by EPGStation
const ffmpeg = process.env.FFMPEG;
const input = process.env.INPUT;
const output = process.env.OUTPUT;

// Program Metadata
const videoHeight = parseInt(process.env.VIDEORESOLUTION, 10);
// EPGStation specifically sets AUDIOCOMPONENTTYPE = 2 for "1/0 + 1/0 Dual Mono"
const isDualMono = parseInt(process.env.AUDIOCOMPONENTTYPE, 10) === 2;
const programName = process.env.NAME || '';
const programExtended = process.env.EXTENDED || '';

// Detect if the program is marked as bilingual [二] or multiplex [多]
const isBilingualOrMultiplex = programName.includes('[二]') || programName.includes('[多]') ||
                               programExtended.includes('[二]') || programExtended.includes('[多]');

// --- FFmpeg Configuration ---

// Standard probe sizes. We increase these significantly for bilingual/multiplex programs
// to ensure delayed audio streams are discovered by FFmpeg.
let analyzedurationSize = '10M';
let probesizeSize = '32M';

if (isBilingualOrMultiplex && !isDualMono) {
  // Boost probe sizes for standard multiple track files to find delayed streams.
  analyzedurationSize = '100M';
  probesizeSize = '100M';
}

const audioBitrate = videoHeight > 720 ? '192k' : '128k';
const preset = 'medium';
const codec = 'h264_qsv';

console.log(`ffmpeg: ${ffmpeg}`);
console.log(`input: ${input}`);
console.log(`output: ${output}`);

// Initialize the base FFmpeg arguments array
const args = [
  // Fast seek to skip the first 4 seconds, avoiding potential garbage data at the very start of recording
  '-ss', '4',
  // Overwrite output file without asking
  '-y',
  // Enable hardware acceleration for decoding
  '-hwaccel', 'qsv',
  // Keep the decoded surface in QSV memory space for faster processing
  '-hwaccel_output_format', 'qsv',
  // Set analysis boundaries for stream detection
  '-analyzeduration', analyzedurationSize,
  '-probesize', probesizeSize,
  // Use QSV hardware decoder for MPEG-2 Video (standard for ISDB-T)
  '-c:v', 'mpeg2_qsv',
  // Specify the input file
  '-i', input,
];

// --- Metadata Configuration ---
args.push(
  // Set Group of Pictures (GOP) size to 52 frames
  '-g', '52',
  // Move the moov atom to the beginning of the file for fast web playback
  '-movflags', 'faststart',
  // Inject Title and Description metadata
  '-metadata', `title=${programName}`,
  '-metadata', `description=${programExtended}`
);

// --- Video Filter Configuration ---
// vpp_qsv=deinterlace=2: Uses advanced hardware deinterlacing
// vpp_qsv=framerate=30000/1001: Sets the framerate to 29.97fps
// vpp_qsv=rate=1: Maintains the framerate
const videoFilter = 'vpp_qsv=deinterlace=2,vpp_qsv=framerate=30000/1001,vpp_qsv=rate=1';
args.push('-vf', videoFilter);

// --- Video Encoding Settings ---
args.push(
  // Video Codec
  '-c:v', codec,
  // Encoder Preset (e.g., fast, medium, slow)
  '-preset', preset,
  // Target Video Bitrate
  '-vb', '5M',
  // Enable lookahead for better bitrate distribution
  '-look_ahead', '1',
  // Set the depth of the lookahead buffer to 30 frames
  '-look_ahead_depth', '30'
);

// --- Audio Configuration & Mapping ---
args.push(
  // Audio Codec
  '-c:a', 'aac',
  // Audio Sample Rate
  '-ar', '48000',
  // Audio Bitrate
  '-ab', audioBitrate
);

if (isDualMono) {
  // SCENARIO A: Dual Mono
  // The broadcast contains a single stereo stream where Left = Main Language, Right = Sub Language.
  // We use filter_complex with the channelsplit filter to isolate these into two separate mono tracks.
  args.push(
    '-filter_complex', '[0:a:0]channelsplit=channel_layout=stereo[left][right]',
    // Map the video stream
    '-map', '0:v:0',
    // Map the Left channel output from channelsplit as Track 1
    '-map', '[left]',
    // Map the Right channel output from channelsplit as Track 2
    '-map', '[right]',
    // Force mono layout for the output audio streams
    '-ac', '1',
    // Tag the first audio stream (Main) as Japanese
    '-metadata:s:a:0', 'language=jpn'
  );
} else if (isBilingualOrMultiplex) {
  // SCENARIO B: Multiple Audio Streams
  // The broadcast is flagged as having multiple languages/commentaries, but is NOT Dual Mono.
  // We rely on our boosted probe sizes to find all delayed physical audio streams.
  args.push(
    // Map the video stream
    '-map', '0:v:0',
    // Map ALL audio streams found in the input to the output.
    // The trailing '?' ensures FFmpeg doesn't fail if no audio streams are found (though unlikely).
    '-map', '0:a?',
    // Ensure standard stereo channel layout for the output streams
    '-ac', '2'
  );
} else {
  // SCENARIO C: Standard Broadcast
  // Standard single audio track. We just let FFmpeg map the default video and audio.
  args.push(
    '-ac', '2'
  );
}

// --- Output Formatting ---
args.push(
  // Container format
  '-f', 'mp4',
  // Output file path
  output
);

// --- Execution ---
const commandString = args.join(' ');
console.error(`Executing: ${ffmpeg} ${commandString}`);

const child = spawn(ffmpeg, args);

child.stderr.on('data', (data) => {
  console.error(String(data));
});

child.on('error', (err) => {
  console.error(`Failed to start child process: ${err}`);
  throw new Error(err);
});

child.on('close', (code) => {
  if (code !== 0) {
    console.error(`ffmpeg process exited with code ${code}`);
  }
});

// Pass SIGINT to the FFmpeg process to allow for graceful termination
process.on('SIGINT', () => {
  console.error('Received SIGINT, killing ffmpeg...');
  child.kill('SIGINT');
});
