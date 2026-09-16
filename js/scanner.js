// scanner.js — WEBAPP_URL comes from config.js (loaded before this file).

let html5QrCode;
let cameraScanning = false;

// --- Audio feedback ---
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function beepTone(ctx, freq, startOffset, duration) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.type = 'sine';
  oscillator.frequency.value = freq;
  const start = ctx.currentTime + startOffset;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.3, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}
function playScanSound(valid) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    if (valid) {
      beepTone(ctx, 1200, 0, 0.15);
    } else {
      beepTone(ctx, 300, 0, 0.12);
      beepTone(ctx, 300, 0.15, 0.12);
    }
  } catch (e) { /* never let audio break the scan flow */ }
}

const scannerSelect = document.getElementById('scannerSelect');
const activeStationLabel = document.getElementById('activeStationLabel');
const passwordOverlay = document.getElementById('passwordOverlay');
const passwordModalText = document.getElementById('passwordModalText');
const stationPasswordInput = document.getElementById('stationPasswordInput');
const passwordError = document.getElementById('passwordError');
const passwordSubmitBtn = document.getElementById('passwordSubmitBtn');
const passwordCancelBtn = document.getElementById('passwordCancelBtn');
const manualInput = document.getElementById('manualInput');
const startBtn = document.getElementById('startBtn');
const validateBtn = document.getElementById('validateBtn');
const resultBox = document.getElementById('resultBox');
const scannedText = document.getElementById('scannedText');
const cameraHint = document.getElementById('cameraHint');
const configWarning = document.getElementById('configWarning');

let unlockedStation = '';
let pendingStation = '';

if (!WEBAPP_URL || WEBAPP_URL.indexOf('PUT_YOUR') === 0) {
  configWarning.style.display = 'block';
}

function currentScannerId() { return unlockedStation || 'unknown'; }

// --- Live per-station counter — shows only the currently unlocked station ---
function loadStationStats() {
  if (!unlockedStation) return;
  fetch(WEBAPP_URL + '?action=stationStats')
    .then(r => r.json())
    .then(counts => {
      const el = document.getElementById('stationStats');
      if (counts.error) { el.innerText = 'Error: ' + counts.error; return; }
      const count = counts[unlockedStation.toLowerCase()] || 0;
      el.innerHTML = capitalize(unlockedStation) + ': <strong>' + count + '</strong> valid scan' + (count === 1 ? '' : 's') + ' today';
    })
    .catch(() => { document.getElementById('stationStats').innerText = 'Could not load count.'; });
}

// --- Station password gate ---
scannerSelect.addEventListener('change', () => {
  const name = scannerSelect.value;
  if (!name) return;
  pendingStation = name;
  passwordModalText.innerText = 'Enter the password for ' + capitalize(name) + ':';
  stationPasswordInput.value = '';
  passwordError.innerText = '';
  passwordOverlay.style.display = 'flex';
  stationPasswordInput.focus();
});

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

passwordCancelBtn.addEventListener('click', () => {
  passwordOverlay.style.display = 'none';
  scannerSelect.value = unlockedStation || '';
});

stationPasswordInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitPassword(); });
passwordSubmitBtn.addEventListener('click', submitPassword);

function submitPassword() {
  const password = stationPasswordInput.value;
  if (!password) return;
  passwordSubmitBtn.disabled = true;

  fetch(WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight
    body: JSON.stringify({ action: 'verifyStation', name: pendingStation, password: password })
  })
    .then(r => r.json())
    .then(res => {
      passwordSubmitBtn.disabled = false;
      if (res.error) { passwordError.innerText = res.error; return; }
      if (!res.ok) {
        passwordError.innerText = (res.message || 'Incorrect password.') +
          (res.debug ? ' | DEBUG: ' + JSON.stringify(res.debug) : '');
        return;
      }

      unlockedStation = pendingStation;
      activeStationLabel.innerText = 'Unlocked as: ' + capitalize(unlockedStation);
      passwordOverlay.style.display = 'none';
      startBtn.disabled = false;
      manualInput.disabled = false;
      validateBtn.disabled = false;
      loadStationStats();
    })
    .catch(err => {
      passwordSubmitBtn.disabled = false;
      passwordError.innerText = 'Error: ' + err.message;
    });
}

manualInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitManual(); });
validateBtn.addEventListener('click', submitManual);

function submitManual() {
  const value = manualInput.value.trim();
  if (!value) return;
  processScan(value);
  manualInput.value = '';
  manualInput.focus();
}

startBtn.addEventListener('click', startScanner);

function startScanner() {
  startBtn.disabled = true;
  if (typeof Html5Qrcode === 'undefined') {
    cameraFallback('Scanner library failed to load (check your connection).');
    return;
  }
  html5QrCode = new Html5Qrcode('reader');
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  attemptCameraStart({ facingMode: 'environment' }, config, () => {
    attemptCameraStart({ facingMode: 'user' }, config, () => {
      Html5Qrcode.getCameras().then(devices => {
        if (!devices || !devices.length) { cameraFallback('No camera found on this device.'); return; }
        attemptCameraStart(devices[0].id, config, err => cameraFallback('Could not start any camera: ' + describeError(err)));
      }).catch(err => cameraFallback('Could not start any camera: ' + describeError(err)));
    });
  });
}

function attemptCameraStart(cameraTarget, config, onFail) {
  html5QrCode.start(cameraTarget, config, onCameraDecoded, () => {})
    .then(() => { cameraScanning = true; })
    .catch(err => onFail(err));
}

function describeError(err) { return err && err.name ? (err.name + ' — ' + err.message) : String(err); }

function cameraFallback(message) {
  startBtn.disabled = false;
  cameraHint.innerHTML = '<span class="err">' + message + ' Use the box below instead.</span>';
  manualInput.focus();
}

function onCameraDecoded(decodedText) {
  if (!cameraScanning) return;
  cameraScanning = false;
  html5QrCode.pause(true);
  processScan(decodedText);
  setTimeout(() => { cameraScanning = true; if (html5QrCode) html5QrCode.resume(); }, 2500);
}

function processScan(text) {
  scannedText.innerText = 'Scanned: ' + text;
  fetch(WEBAPP_URL + '?action=scan&qr=' + encodeURIComponent(text) + '&scannerId=' + encodeURIComponent(currentScannerId()))
    .then(r => r.json())
    .then(showResult)
    .catch(showError);
}

function showResult(res) {
  if (res.error) { showError({ message: res.error }); return; }
  resultBox.style.display = 'block';
  resultBox.className = 'result ' + (res.valid ? 'valid' : 'invalid');
  resultBox.innerText = (res.valid ? '✅ ' : '❌ ') + res.message;
  playScanSound(res.valid);

  if (res.valid) loadStationStats();
}

function showError(err) {
  alert('Error: ' + (err && err.message ? err.message : err));
}