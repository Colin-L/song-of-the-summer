const API_BASE = 'http://localhost:3000/api/sots';
const STATE = {
  playlist: null,
  tracks: [],
  filteredTracks: [],
  selectedTrack: null,
};

async function activate() {
  addListeners();
  await getPlaylist();
}

function addListeners() {
  const searchInput = document.getElementById('searchInput');
  const sortSelect = document.getElementById('sortSelect');
  const resetVotesBtn = document.getElementById('resetVotesBtn');

  searchInput.addEventListener('input', renderTracks);
  sortSelect.addEventListener('change', renderTracks);
  resetVotesBtn.addEventListener('click', resetVotes);

  window.addEventListener('click', function (event) {
    const dropdown = document.getElementById('myDropdown');
    const modal = document.getElementById('modal');

    if (!event.target.closest('.customdropdown') && dropdown.classList.contains('show')) {
      dropdown.classList.remove('show');
    }

    if (event.target === modal) {
      closeModal();
    }
  });

  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeModal();
    }
  });
}

async function getPlaylist() {
  setStatus('Loading playlist...');

  try {
    const response = await fetch(`${API_BASE}/getPlaylist`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const playlist = await response.json();

    STATE.playlist = playlist;
    STATE.tracks = (playlist?.tracks?.items || [])
      .map(item => item.track)
      .filter(Boolean)
      .shuffle();

    document.getElementById('playlistName').textContent = playlist.description || 'Song of the Summer';
    document.getElementById('playlistMeta').textContent = `${STATE.tracks.length} tracks loaded`;

    renderTracks();
    setStatus('Pick a song and vote. One local vote per browser.');
  } catch (error) {
    console.error('Error loading playlist:', error);
    setStatus('Could not reach playlist API. Check localhost:3000.');
    document.getElementById('songListContainer').innerHTML = '';
  }
}

function renderTracks() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  const sortBy = document.getElementById('sortSelect').value;

  let tracks = [...STATE.tracks];

  if (query) {
    tracks = tracks.filter(track => {
      const artist = (track.artists || []).map(a => a.name).join(', ').toLowerCase();
      return track.name.toLowerCase().includes(query) || artist.includes(query);
    });
  }

  if (sortBy === 'title') {
    tracks.sort((a, b) => a.name.localeCompare(b.name));
  }

  if (sortBy === 'artist') {
    tracks.sort((a, b) => getArtist(a).localeCompare(getArtist(b)));
  }

  STATE.filteredTracks = tracks;

  const container = document.getElementById('songListContainer');
  container.innerHTML = '';

  if (!tracks.length) {
    container.innerHTML = '<p class="muted">No songs match your search.</p>';
    return;
  }

  for (const track of tracks) {
    container.appendChild(createTrackCard(track));
  }
}

function createTrackCard(song) {
  const card = document.createElement('article');
  card.className = 'song-card';
  card.dataset.trackId = song.id;
  card.tabIndex = 0;

  card.innerHTML = `
    <img src="${song.album.images?.[0]?.url || ''}" alt="Album art for ${escapeHtml(song.name)}">
    <div class="song-info">
      <h2 class="song-title">${escapeHtml(song.name)}</h2>
      <p class="song-meta">${escapeHtml(getArtist(song))}</p>
    </div>
  `;

  card.addEventListener('click', () => openModal(song));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openModal(song);
    }
  });

  return card;
}

function openModal(track) {
  STATE.selectedTrack = track;

  const modal = document.getElementById('modal');
  const modalContent = document.getElementById('modal-content');

  modalContent.innerHTML = `
    <h2>${escapeHtml(track.name)}</h2>
    <p class="muted">${escapeHtml(getArtist(track))}</p>
    <img src="${track.album.images?.[0]?.url || ''}" alt="Album art for ${escapeHtml(track.name)}">
    <div class="modal-actions">
      <button class="btn btn-primary" id="voteBtn">Vote</button>
      <button class="btn btn-default" id="closeBtn">Close</button>
    </div>
  `;

  modalContent.querySelector('#voteBtn').addEventListener('click', vote);
  modalContent.querySelector('#closeBtn').addEventListener('click', closeModal);

  modal.style.display = 'block';
  requestAnimationFrame(() => { modal.style.opacity = '1'; });
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  const modal = document.getElementById('modal');
  if (!modal || modal.style.display === 'none') return;

  modal.style.opacity = '0';
  setTimeout(() => {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    clearModal();
  }, 220);
}

function clearModal() {
  const modalContent = document.getElementById('modal-content');
  if (modalContent) modalContent.innerHTML = '';
}

async function vote() {
  const timesVoted = getVotedCount();

  if (timesVoted > 0) {
    showVoteMessage(timesVoted);
    incrementVotedCount();
    return;
  }

  const voteData = {
    trackId: STATE.selectedTrack?.id,
    trackName: STATE.selectedTrack?.name,
    artist: getArtist(STATE.selectedTrack),
    votedAt: new Date().toISOString(),
  };

  try {
    await sendVote(voteData);
    incrementVotedCount();
  } catch (error) {
    console.error(error);
    showVoteError('Vote failed. Is the API running on localhost:3000?');
  }
}

function getVotedCount() {
  const localValue = Number(localStorage.getItem('sotsVotedCount') || 0);
  if (Number.isFinite(localValue) && localValue >= 0) return localValue;

  const cookies = document.cookie.split(';');
  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i].trim();
    if (cookie.startsWith('voted=')) {
      const cookieValue = cookie.substring('voted='.length);
      return parseInt(cookieValue, 10) || 0;
    }
  }

  return 0;
}

function incrementVotedCount() {
  const newCount = getVotedCount() + 1;
  localStorage.setItem('sotsVotedCount', String(newCount));

  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + 30);
  document.cookie = `voted=${newCount}; expires=${expirationDate.toUTCString()}; path=/`;
}

function resetVotes() {
  localStorage.removeItem('sotsVotedCount');
  document.cookie = 'voted=0; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
  setStatus('Local vote count reset for this browser.');
}

function showVoteMessage(timesVoted) {
  clearModal();

  const voteMessage = document.createElement('h2');

  switch (timesVoted) {
    case 1:
      voteMessage.textContent = 'Woah there buddy, it looks like you already voted.';
      break;
    case 2:
      voteMessage.textContent = "Hey man, you've tried this twice. Go away.";
      break;
    case 3:
      voteMessage.textContent = 'Vote cast successfully';
      setTimeout(function () {
        voteMessage.textContent = 'Just kidding 😈 you really thought that would work?';
      }, 1800);
      break;
    case 4:
      voteMessage.textContent = 'This you?';
      showLocation();
      break;
    default:
      showSpoopyImage();
      return;
  }

  document.getElementById('modal-content').prepend(voteMessage);
}

function showVoteError(message) {
  clearModal();
  const voteMessage = document.createElement('h2');
  voteMessage.textContent = message;
  document.getElementById('modal-content').prepend(voteMessage);
}

function showLocation() {
  const endpoint = 'http://ip-api.com/json/?fields=57536';

  fetch(endpoint)
    .then(response => response.json())
    .then(response => {
      if (response.status !== 'success') {
        throw new Error(response.message || 'Location query failed');
      }

      const mapDiv = document.createElement('div');
      mapDiv.id = 'map';
      mapDiv.className = 'map-box';
      document.getElementById('modal-content').appendChild(mapDiv);

      const cityCoordinates = [response.lat, response.lon];

      const map = L.map(mapDiv, { zoomControl: false }).setView(cityCoordinates, 8);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data © OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);

      L.circle(cityCoordinates, {
        color: 'red',
        fillColor: '#f03',
        fillOpacity: 0.45,
        radius: 500,
      }).addTo(map);

      map.flyTo(cityCoordinates, 13, { animate: true, duration: 4 });
    })
    .catch(error => {
      console.error(error);
      const p = document.createElement('p');
      p.textContent = 'Location lookup failed.';
      document.getElementById('modal-content').appendChild(p);
    });
}

function showSpoopyImage() {
  const imageSrc = './assets/cat.jpg';
  const screamSound = './assets/Scream.mp3';
  const modalContent = document.getElementById('modal-content');

  const image = new Image();
  image.classList.add('spoopy-image');
  image.src = imageSrc;

  const audio = new Audio(screamSound);
  modalContent.appendChild(image);
  audio.play().catch(() => {});

  setTimeout(closeModal, 3500);
}

async function sendVote(voteData) {
  const response = await fetch(`${API_BASE}/vote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(voteData),
  });

  if (!response.ok) {
    throw new Error(`Vote API error: ${response.status}`);
  }

  clearModal();
  const voteMessage = document.createElement('h2');
  voteMessage.textContent = 'Vote Counted!';
  document.getElementById('modal-content').prepend(voteMessage);

  return response.json().catch(() => ({}));
}

function showContactDropdown() {
  document.getElementById('myDropdown').classList.toggle('show');
}

function copyToClipboard(btn) {
  const emailAddress = 'colinbleslie@gmail.com';

  navigator.clipboard.writeText(emailAddress)
    .then(() => {
      btn.style.backgroundColor = '#a1a4a8';
      setStatus('Email copied to clipboard.');
    })
    .catch(() => {
      const tempInput = document.createElement('input');
      document.body.appendChild(tempInput);
      tempInput.value = emailAddress;
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
      btn.style.backgroundColor = '#a1a4a8';
      setStatus('Email copied to clipboard.');
    });
}

function setStatus(message) {
  const statusBar = document.getElementById('statusBar');
  if (statusBar) statusBar.textContent = message;
}

function getArtist(track) {
  return (track?.artists || []).map(a => a.name).join(', ') || 'Unknown artist';
}

function escapeHtml(input) {
  const div = document.createElement('div');
  div.textContent = input || '';
  return div.innerHTML;
}

Object.defineProperty(Array.prototype, 'shuffle', {
  value: function () {
    for (let i = this.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this[i], this[j]] = [this[j], this[i]];
    }
    return this;
  },
  enumerable: false,
});

activate();
