const state = {
  speed: 0,
  speedLimit: Number(localStorage.getItem("roadly-speed-limit")) || 50,
  coords: null,
  watchId: null,
  demoTimer: null,
  demoTick: 0,
  tripStartedAt: null,
  previousPosition: null,
  tripDistanceKm: 0,
  musicTimer: null,
  currentTrack: 0,
  trackProgress: 18,
  isPlaying: false,
  hasWarned: false,
};

const tracks = [
  { title: "Night Drive", artist: "Aerial Motion", duration: 228 },
  { title: "City Lights", artist: "Neon State", duration: 196 },
  { title: "Open Road", artist: "Northbound", duration: 243 },
];

const elements = {
  clock: document.querySelector("#clock"),
  gpsDot: document.querySelector("#gps-dot"),
  gpsLabel: document.querySelector("#gps-label"),
  startDrive: document.querySelector("#start-drive"),
  locateButton: document.querySelector("#locate-button"),
  routeForm: document.querySelector("#route-form"),
  destination: document.querySelector("#destination"),
  speedValue: document.querySelector("#speed-value"),
  speedProgress: document.querySelector("#speed-progress"),
  speedometer: document.querySelector("#speedometer"),
  speedLimit: document.querySelector("#speed-limit"),
  speedAlert: document.querySelector("#speed-alert"),
  speedSource: document.querySelector("#speed-source"),
  tripDistance: document.querySelector("#trip-distance"),
  tripTime: document.querySelector("#trip-time"),
  demoToggle: document.querySelector("#demo-toggle"),
  settingsDialog: document.querySelector("#settings-dialog"),
  speedWarningToggle: document.querySelector("#speed-warning-toggle"),
  vibrationToggle: document.querySelector("#vibration-toggle"),
  defaultLimit: document.querySelector("#default-limit"),
  playToggle: document.querySelector("#play-toggle"),
  previousTrack: document.querySelector("#previous-track"),
  nextTrack: document.querySelector("#next-track"),
  trackProgress: document.querySelector("#track-progress"),
  elapsedTime: document.querySelector("#elapsed-time"),
  durationTime: document.querySelector("#duration-time"),
  musicTitle: document.querySelector("#music-title"),
  artistName: document.querySelector("#artist-name"),
  voiceAction: document.querySelector("#voice-action"),
  toast: document.querySelector("#toast"),
};

let toastTimer;

function init() {
  if (window.lucide) {
    window.lucide.createIcons({ attrs: { "stroke-width": 2 } });
  } else {
    window.addEventListener("load", () => window.lucide?.createIcons({ attrs: { "stroke-width": 2 } }));
  }

  elements.speedLimit.textContent = state.speedLimit;
  elements.defaultLimit.value = String(state.speedLimit);
  updateClock();
  updateMusicUI();
  updateSpeed(0);
  bindEvents();

  setInterval(updateClock, 1000);
  setInterval(updateTripTime, 1000);

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

function bindEvents() {
  elements.startDrive.addEventListener("click", startGps);
  elements.locateButton.addEventListener("click", startGps);
  elements.demoToggle.addEventListener("click", toggleDemo);
  elements.routeForm.addEventListener("submit", openRoute);

  document.querySelectorAll("[data-limit-step]").forEach((button) => {
    button.addEventListener("click", () => setSpeedLimit(state.speedLimit + Number(button.dataset.limitStep)));
  });

  document.querySelector("#limit-sign").addEventListener("click", () => {
    const limits = [30, 50, 70, 90, 110, 130];
    const next = limits[(limits.indexOf(state.speedLimit) + 1) % limits.length] || 50;
    setSpeedLimit(next);
  });

  document.querySelectorAll("[data-open-settings]").forEach((button) => {
    button.addEventListener("click", () => elements.settingsDialog.showModal());
  });

  elements.defaultLimit.addEventListener("change", () => setSpeedLimit(Number(elements.defaultLimit.value)));
  elements.speedWarningToggle.addEventListener("change", () => updateSpeed(state.speed));
  elements.playToggle.addEventListener("click", togglePlayback);
  elements.previousTrack.addEventListener("click", () => changeTrack(-1));
  elements.nextTrack.addEventListener("click", () => changeTrack(1));
  elements.trackProgress.addEventListener("input", () => {
    state.trackProgress = Number(elements.trackProgress.value);
    updateTrackTime();
  });

  elements.voiceAction.addEventListener("click", startVoiceSearch);

  document.querySelectorAll("[data-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.querySelector(`#${button.dataset.target}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveNavigation(button.dataset.target);
    });
  });
}

function updateClock() {
  elements.clock.textContent = new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function startGps() {
  if (!navigator.geolocation) {
    showToast("Геолокація не підтримується цим браузером");
    return;
  }

  stopDemo();
  elements.gpsLabel.textContent = "Пошук GPS-сигналу…";
  elements.startDrive.disabled = true;

  if (!state.tripStartedAt) state.tripStartedAt = Date.now();
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);

  state.watchId = navigator.geolocation.watchPosition(handlePosition, handlePositionError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 12000,
  });
}

function handlePosition(position) {
  const { latitude, longitude, speed, accuracy } = position.coords;
  state.coords = { latitude, longitude };
  elements.startDrive.disabled = false;
  elements.startDrive.querySelector("span").textContent = "GPS активний";
  elements.gpsDot.classList.add("is-live");
  elements.gpsLabel.textContent = `GPS ±${Math.round(accuracy)} м`;

  const nextSpeed = Number.isFinite(speed) && speed >= 0 ? speed * 3.6 : 0;
  updateSpeed(nextSpeed);
  updateTripDistance(latitude, longitude);
}

function handlePositionError(error) {
  elements.startDrive.disabled = false;
  elements.gpsDot.classList.remove("is-live");
  const messages = {
    1: "Дозвольте доступ до геолокації в браузері",
    2: "GPS-сигнал зараз недоступний",
    3: "GPS не відповів. Спробуйте ще раз",
  };
  elements.gpsLabel.textContent = "GPS неактивний";
  showToast(messages[error.code] || "Не вдалося отримати геолокацію");
}

function updateSpeed(rawSpeed) {
  state.speed = Math.max(0, Math.min(240, rawSpeed));
  const rounded = Math.round(state.speed);
  const circumference = 666;
  const progress = Math.min(state.speed / 180, 1);
  elements.speedValue.textContent = rounded;
  elements.speedProgress.style.strokeDashoffset = String(circumference - circumference * progress);

  const isOver = rounded > state.speedLimit;
  elements.speedometer.classList.toggle("is-over", isOver);
  elements.speedAlert.hidden = !(isOver && elements.speedWarningToggle.checked);

  if (isOver && !state.hasWarned && elements.speedWarningToggle.checked) {
    state.hasWarned = true;
    if (elements.vibrationToggle.checked && navigator.vibrate) navigator.vibrate(180);
  }

  if (!isOver) state.hasWarned = false;
}

function setSpeedLimit(value) {
  state.speedLimit = Math.max(20, Math.min(130, Math.round(value / 10) * 10));
  elements.speedLimit.textContent = state.speedLimit;
  elements.defaultLimit.value = String(state.speedLimit);
  localStorage.setItem("roadly-speed-limit", String(state.speedLimit));
  updateSpeed(state.speed);
}

function toggleDemo() {
  if (state.demoTimer) {
    stopDemo();
    updateSpeed(0);
    elements.gpsLabel.textContent = "GPS очікує дозволу";
    return;
  }

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }

  if (!state.tripStartedAt) state.tripStartedAt = Date.now();
  state.demoTick = 0;
  elements.demoToggle.setAttribute("aria-pressed", "true");
  elements.speedSource.textContent = "DEMO";
  elements.speedSource.classList.add("is-demo");
  elements.gpsDot.classList.add("is-live");
  elements.gpsLabel.textContent = "Демонстраційний режим";
  showToast("Демо увімкнено — значення швидкості не є даними GPS");

  const pattern = [0, 8, 18, 31, 44, 52, 59, 66, 72, 64, 55, 47, 38, 25, 12, 0];
  state.demoTimer = window.setInterval(() => {
    updateSpeed(pattern[state.demoTick % pattern.length]);
    state.demoTick += 1;
  }, 850);
  updateSpeed(pattern[0]);
}

function stopDemo() {
  if (!state.demoTimer) return;
  clearInterval(state.demoTimer);
  state.demoTimer = null;
  elements.demoToggle.setAttribute("aria-pressed", "false");
  elements.speedSource.textContent = "GPS";
  elements.speedSource.classList.remove("is-demo");
}

function openRoute(event) {
  event.preventDefault();
  const destination = elements.destination.value.trim();
  if (!destination) return;

  const params = new URLSearchParams({ api: "1", destination, travelmode: "driving" });
  if (state.coords) params.set("origin", `${state.coords.latitude},${state.coords.longitude}`);
  window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank", "noopener,noreferrer");
}

function updateTripDistance(latitude, longitude) {
  const current = { latitude, longitude };
  if (state.previousPosition) {
    const delta = haversineKm(state.previousPosition, current);
    if (delta < 0.5) state.tripDistanceKm += delta;
  }
  state.previousPosition = current;
  elements.tripDistance.textContent = `${state.tripDistanceKm.toFixed(1).replace(".", ",")} км`;
}

function haversineKm(a, b) {
  const radius = 6371;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function updateTripTime() {
  if (!state.tripStartedAt) return;
  const seconds = Math.floor((Date.now() - state.tripStartedAt) / 1000);
  const minutes = Math.floor(seconds / 60);
  elements.tripTime.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function togglePlayback() {
  state.isPlaying = !state.isPlaying;
  elements.playToggle.setAttribute("aria-pressed", String(state.isPlaying));
  elements.playToggle.setAttribute("aria-label", state.isPlaying ? "Пауза" : "Відтворити");
  elements.playToggle.innerHTML = `<i data-lucide="${state.isPlaying ? "pause" : "play"}" aria-hidden="true"></i>`;
  window.lucide?.createIcons({ attrs: { "stroke-width": 2 } });

  if (state.isPlaying) {
    state.musicTimer = window.setInterval(() => {
      state.trackProgress += 100 / tracks[state.currentTrack].duration;
      if (state.trackProgress >= 100) changeTrack(1);
      updateTrackTime();
    }, 1000);
  } else {
    clearInterval(state.musicTimer);
    state.musicTimer = null;
  }
}

function changeTrack(direction) {
  state.currentTrack = (state.currentTrack + direction + tracks.length) % tracks.length;
  state.trackProgress = 0;
  updateMusicUI();
}

function updateMusicUI() {
  const track = tracks[state.currentTrack];
  elements.musicTitle.textContent = track.title;
  elements.artistName.textContent = track.artist;
  elements.durationTime.textContent = formatTime(track.duration);
  updateTrackTime();

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: "Roadly demo queue" });
  }
}

function updateTrackTime() {
  const duration = tracks[state.currentTrack].duration;
  elements.trackProgress.value = String(state.trackProgress);
  elements.elapsedTime.textContent = formatTime(Math.round((state.trackProgress / 100) * duration));
}

function formatTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function startVoiceSearch() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    elements.destination.focus();
    showToast("Голосовий ввід не підтримується — введіть адресу вручну");
    return;
  }

  const recognition = new Recognition();
  recognition.lang = "uk-UA";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.addEventListener("start", () => showToast("Слухаю… назвіть пункт призначення"));
  recognition.addEventListener("result", (event) => {
    elements.destination.value = event.results[0][0].transcript;
    elements.destination.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  recognition.addEventListener("error", () => showToast("Не вдалося розпізнати голос"));
  recognition.start();
}

function setActiveNavigation(target) {
  document.querySelectorAll("[data-target]").forEach((item) => {
    const active = item.dataset.target === target;
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3600);
}

init();
