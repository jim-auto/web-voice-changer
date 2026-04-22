import './styles.css';
import { AudioRecorder, drawWaveform, playFloat32Audio } from './audio.js';
import { VoiceChanger } from './inference.js';

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="shell">
    <section class="studio" aria-label="web-voice-changer controls">
      <div class="topbar">
        <div>
          <p class="eyebrow">Browser voice conversion demo</p>
          <h1>web-voice-changer</h1>
        </div>
        <div class="status-block">
          <span id="status" class="status idle">idle</span>
          <span id="timer" class="timer">00:00.0</span>
        </div>
      </div>

      <div class="controls" aria-label="Recording controls">
        <button id="recordButton" class="button record" type="button">
          <span class="button-icon record-icon" aria-hidden="true"></span>
          <span>Record</span>
        </button>
        <button id="stopButton" class="button stop" type="button" disabled>
          <span class="button-icon stop-icon" aria-hidden="true"></span>
          <span>Stop</span>
        </button>
      </div>

      <dl class="metrics">
        <div>
          <dt>Engine</dt>
          <dd id="engine">not loaded</dd>
        </div>
        <div>
          <dt>Sample rate</dt>
          <dd id="sampleRate">-</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd id="duration">-</dd>
        </div>
      </dl>

      <div id="message" class="message" role="status" aria-live="polite"></div>
    </section>

    <section class="waveforms" aria-label="Waveforms">
      <article class="waveform-panel">
        <div class="panel-header">
          <h2>Input</h2>
          <span>microphone</span>
        </div>
        <canvas id="inputWaveform" class="waveform" width="960" height="260"></canvas>
      </article>
      <article class="waveform-panel">
        <div class="panel-header">
          <h2>Output</h2>
          <span>onnx</span>
        </div>
        <canvas id="outputWaveform" class="waveform" width="960" height="260"></canvas>
      </article>
    </section>
  </main>
`;

const recordButton = document.querySelector('#recordButton');
const stopButton = document.querySelector('#stopButton');
const statusElement = document.querySelector('#status');
const timerElement = document.querySelector('#timer');
const engineElement = document.querySelector('#engine');
const sampleRateElement = document.querySelector('#sampleRate');
const durationElement = document.querySelector('#duration');
const messageElement = document.querySelector('#message');
const inputWaveform = document.querySelector('#inputWaveform');
const outputWaveform = document.querySelector('#outputWaveform');

const recorder = new AudioRecorder({
  onTick(seconds) {
    timerElement.textContent = formatTime(seconds);
  },
});
const voiceChanger = new VoiceChanger();
let lastInputSamples = null;
let lastOutputSamples = null;

drawWaveform(inputWaveform);
drawWaveform(outputWaveform, null, { color: '#744f2d' });

recordButton.addEventListener('click', async () => {
  try {
    setMessage('');
    recordButton.disabled = true;
    stopButton.disabled = true;
    engineElement.textContent = voiceChanger.provider;
    sampleRateElement.textContent = '-';
    durationElement.textContent = '-';
    timerElement.textContent = '00:00.0';
    lastInputSamples = null;
    lastOutputSamples = null;
    drawWaveform(inputWaveform);
    drawWaveform(outputWaveform, null, { color: '#744f2d' });

    await recorder.start();
    setStatus('recording');
    stopButton.disabled = false;
  } catch (error) {
    recorder.cancel();
    setStatus('error');
    setMessage(error.message);
    recordButton.disabled = false;
    stopButton.disabled = true;
  }
});

stopButton.addEventListener('click', async () => {
  try {
    setStatus('processing');
    setMessage('');
    recordButton.disabled = true;
    stopButton.disabled = true;

    const recording = await recorder.stop();
    lastInputSamples = recording.samples;
    drawWaveform(inputWaveform, recording.samples);
    sampleRateElement.textContent = `${recording.sampleRate.toLocaleString()} Hz`;
    durationElement.textContent = `${recording.duration.toFixed(2)} s`;

    const converted = await voiceChanger.convert(recording.samples, recording.sampleRate);
    lastOutputSamples = converted.samples;
    engineElement.textContent = converted.provider;
    drawWaveform(outputWaveform, converted.samples, { color: '#744f2d' });

    if (converted.warning) {
      setMessage(converted.warning);
    }

    setStatus('done');
    await playFloat32Audio(converted.samples, converted.sampleRate);
  } catch (error) {
    recorder.cancel();
    setStatus('error');
    setMessage(error.message);
  } finally {
    recordButton.disabled = false;
    stopButton.disabled = true;
  }
});

window.addEventListener('resize', () => {
  drawWaveform(inputWaveform, lastInputSamples);
  drawWaveform(outputWaveform, lastOutputSamples, { color: '#744f2d' });
});

function setStatus(status) {
  statusElement.textContent = status;
  statusElement.className = `status ${status}`;
}

function setMessage(message) {
  messageElement.textContent = message;
  messageElement.hidden = !message;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`;
}
