// log.js — WEBAPP_URL comes from config.js (loaded before this file).

let selectedRowIndex = null;
let selectedId = '';

const configWarning = document.getElementById('configWarning');
const overlay = document.getElementById('overlay');
const modalText = document.getElementById('modalText');

if (!WEBAPP_URL || WEBAPP_URL.indexOf('PUT_YOUR') === 0) {
  configWarning.style.display = 'block';
}

document.getElementById('deleteConfirmBtn').addEventListener('click', confirmDelete);
document.getElementById('cancelBtn').addEventListener('click', closeModal);

function load() {
  fetch(WEBAPP_URL + '?action=log')
    .then(r => r.json())
    .then(render)
    .catch(err => alert('Error: ' + err.message));
}

function render(rows) {
  const container = document.getElementById('logContainer');
  if (rows.error) { container.innerHTML = '<p class="err">Error: ' + rows.error + '</p>'; return; }
  if (!rows.length) { container.innerHTML = '<p>No scans yet.</p>'; return; }

  const groups = {};
  rows.forEach(r => {
    const d = r.scanDate || 'Unknown';
    if (!groups[d]) groups[d] = [];
    groups[d].push(r);
  });

  let html = '';
  Object.keys(groups).sort().reverse().forEach(date => {
    html += '<div class="day-header">' + date + '</div>';
    html += '<table><thead><tr><th>Time</th><th>ID</th><th>Day #</th><th>Station</th><th>Result</th></tr></thead><tbody>';
    groups[date].forEach(r => {
      const cls = r.result === 'valid' ? 'ok' : 'err';
      const time = new Date(r.timestamp).toLocaleTimeString();
      html += '<tr class="clickable" data-id="' + r.id + '" data-row="' + r.rowIndex + '"><td>' + time + '</td><td>' + r.id +
        '</td><td>' + (r.dayNumber || '-') + '</td><td>' + (r.scannerId || '-') + '</td><td class="' + cls + '">' + r.result + '</td></tr>';
    });
    html += '</tbody></table>';
  });
  container.innerHTML = html;

  container.querySelectorAll('tr.clickable').forEach(row => {
    row.addEventListener('click', () => openModal(row.dataset.id, row.dataset.row));
  });
}

function openModal(id, rowIndex) {
  selectedId = id;
  selectedRowIndex = rowIndex;
  modalText.innerText = 'Log entry for ID: ' + id + '\nDelete this record?';
  overlay.style.display = 'flex';
}

function closeModal() {
  overlay.style.display = 'none';
  selectedId = '';
  selectedRowIndex = null;
}

function confirmDelete() {
  fetch(WEBAPP_URL + '?action=deleteLog&rowIndex=' + encodeURIComponent(selectedRowIndex) + '&id=' + encodeURIComponent(selectedId))
    .then(r => r.json())
    .then(res => {
      alert(res.message || res.error);
      closeModal();
      load();
    })
    .catch(err => alert('Error: ' + err.message));
}

load();
